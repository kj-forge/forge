import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { liveStateKey, parseLiveState, serializeLiveState } from "@/features/strength/lib/hyrox-live-store";
import {
  type HyroxBlockPlan,
  type HyroxTimerEvent,
  type HyroxTimerState,
  hyroxTimerReducer,
  initialTimerState,
  type LiveSegment,
  type PersistedSegment,
  rehydrateFromSegments,
  restRemainingMs,
  unsavedClosedSegments,
} from "@/features/strength/lib/hyrox-timer";
import { saveHyroxSegments } from "@/features/strength/server/segments";
import { endSession } from "@/features/strength/server/sessions";
import { getErrorMessage } from "@/lib/error-message";

// Structural subset of getSessionDetails' `steps` — avoids importing the
// loader's inferred type into a hook that only needs these fields.
export interface LoaderStep {
  id: string;
  orderIndex: number;
  targetRounds: number | null;
  restSeconds: number | null;
  movements: {
    id: string;
    orderIndex: number;
    exerciseNamePl: string;
    targetReps: number | null;
    targetDistanceM: number | null;
  }[];
}

export interface HyroxLive {
  state: HyroxTimerState;
  plan: HyroxBlockPlan[];
  nowMs: number; // rAF-driven, for selectors read at render time
  tap(): void;
  undo(): void;
  pauseToggle(): void;
  endBlockEarly(): void;
  extraRound(): void;
  syncError: string | null; // non-blocking message after >=2 consecutive flush failures
  finish(notes?: string): Promise<void>; // flushes everything + endSession + clears storage
}

// Same convention as HyroxSessionView's skeleton formatTarget — duplicated on
// purpose, this hook does not import from the view.
function stationTarget(movement: { targetReps: number | null; targetDistanceM: number | null }): string | null {
  if (movement.targetReps !== null) return `${movement.targetReps} powt.`;
  if (movement.targetDistanceM !== null) return `${movement.targetDistanceM} m`;
  return null;
}

function buildPlan(steps: LoaderStep[]): HyroxBlockPlan[] {
  return [...steps]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((step) => ({
      blockId: step.id,
      targetRounds: step.targetRounds ?? 1,
      restSeconds: step.restSeconds,
      stations: [...step.movements]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((movement) => ({
          blockMovementId: movement.id,
          label: movement.exerciseNamePl,
          target: stationTarget(movement),
        })),
    }));
}

// Wake lock is held for the whole live session except the very start (idle,
// nothing tapped yet) and the very end (done).
function needsWakeLock(state: HyroxTimerState): boolean {
  if (state.phase === "done") return false;
  if (state.phase === "idle" && state.blockIndex === 0 && state.segments.length === 0) return false;
  return true;
}

async function flushSegments(sessionId: string, plan: HyroxBlockPlan[], segments: LiveSegment[]): Promise<void> {
  // A boundary batch can only span one block by construction, but group
  // defensively — the server fn takes one blockId per call.
  const byBlock = new Map<string, LiveSegment[]>();
  for (const seg of segments) {
    const blockId = plan[seg.blockIndex]?.blockId;
    if (!blockId) continue;
    const group = byBlock.get(blockId);
    if (group) group.push(seg);
    else byBlock.set(blockId, [seg]);
  }
  for (const [blockId, group] of byBlock) {
    await saveHyroxSegments({
      data: {
        sessionId,
        blockId,
        segments: group.map((seg) => ({
          roundNumber: seg.roundNumber,
          orderIndex: seg.orderIndex,
          kind: seg.kind,
          blockMovementId: seg.blockMovementId ?? undefined,
          // unsavedClosedSegments only ever yields closed segments (durationMs !== null).
          durationMs: seg.durationMs ?? 0,
        })),
      },
    });
  }
}

export function useHyroxLive(sessionId: string, steps: LoaderStep[], persisted: PersistedSegment[]): HyroxLive {
  const router = useRouter();
  const plan = useMemo(() => buildPlan(steps), [steps]);

  const [state, setState] = useState<HyroxTimerState>(() => {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(liveStateKey(sessionId));
    const fromStorage = parseLiveState(sessionId, raw);
    if (fromStorage) return fromStorage;
    if (persisted.length > 0) return rehydrateFromSegments(plan, persisted);
    return initialTimerState();
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [syncError, setSyncError] = useState<string | null>(null);

  // Mirrors `state` synchronously (ahead of React's own re-render) so async
  // callbacks (flush retries, the online listener) never dispatch against a
  // stale snapshot.
  const stateRef = useRef(state);
  const flushingRef = useRef(false); // one flush in flight at a time
  const pendingRetryRef = useRef(false);
  const failCountRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const prevRestRemainingRef = useRef<number | null>(null);

  function dispatch(event: HyroxTimerEvent) {
    const next = hyroxTimerReducer(stateRef.current, plan, event);
    stateRef.current = next;
    setState(next);
    try {
      localStorage.setItem(liveStateKey(sessionId), serializeLiveState(sessionId, next));
    } catch {
      // Quota exceeded / private-mode storage — the in-memory timer keeps running regardless.
    }
    maybeFlush(next);
  }

  function maybeFlush(next: HyroxTimerState) {
    if (next.phase !== "rest" && next.phase !== "blockDone" && next.phase !== "done") return;
    if (unsavedClosedSegments(next).length === 0) return;
    void runFlush();
  }

  async function runFlush() {
    if (flushingRef.current) {
      pendingRetryRef.current = true;
      return;
    }
    const current = stateRef.current;
    const unsaved = unsavedClosedSegments(current);
    if (unsaved.length === 0) return;
    flushingRef.current = true;
    try {
      await flushSegments(sessionId, plan, unsaved);
      failCountRef.current = 0;
      setSyncError(null);
      dispatch({ type: "markSaved", count: current.persistedCount + unsaved.length });
    } catch (err) {
      failCountRef.current += 1;
      if (failCountRef.current >= 2) {
        setSyncError(getErrorMessage(err, "Nie udało się zsynchronizować postępu. Ponawiamy w tle."));
      }
    } finally {
      flushingRef.current = false;
      if (pendingRetryRef.current) {
        pendingRetryRef.current = false;
        void runFlush();
      }
    }
  }

  // Retry a previously failed flush once connectivity is back, independent of phase.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runFlush closes over refs/stable setters only — mount-once listener is intentional.
  useEffect(() => {
    const onOnline = () => void runFlush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Fresh timestamp for the first render after any event, even while ticking
  // is otherwise paused/idle.
  // biome-ignore lint/correctness/useExhaustiveDependencies: state is a trigger, not read — this must re-run on every dispatch.
  useEffect(() => {
    setNowMs(Date.now());
  }, [state]);

  const hasTail = state.segments.length > 0 && state.segments[state.segments.length - 1].durationMs === null;
  const paused = state.pausedAtMs !== null;
  const ticking = (hasTail || state.phase === "rest") && !paused;

  useEffect(() => {
    if (!ticking) return;
    let frame = requestAnimationFrame(function loop() {
      setNowMs(Date.now());
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [ticking]);

  // Wake lock: acquire while needed, release on the phase falling out of that
  // window OR on unmount (same cleanup path covers both). Safari without
  // support (no navigator.wakeLock) or a refused request is a silent no-op.
  const shouldHoldWakeLock = needsWakeLock(state);
  useEffect(() => {
    if (!shouldHoldWakeLock) return;
    let cancelled = false;
    (async () => {
      try {
        const sentinel = await navigator.wakeLock?.request("screen");
        if (cancelled) {
          await sentinel?.release();
          return;
        }
        wakeLockRef.current = sentinel ?? null;
      } catch {
        // Unsupported or refused — no-op.
      }
    })();
    return () => {
      cancelled = true;
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      void sentinel?.release().catch(() => {});
    };
  }, [shouldHoldWakeLock]);

  // Chrome silently drops the wake lock when the tab is backgrounded — reacquire it once visible again.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (wakeLockRef.current || !needsWakeLock(stateRef.current)) return;
      navigator.wakeLock
        ?.request("screen")
        .then((sentinel) => {
          wakeLockRef.current = sentinel;
        })
        .catch(() => {
          // Unsupported or refused — no-op.
        });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Vibrate exactly once on the rest countdown crossing zero (edge, not level).
  useEffect(() => {
    const remaining = restRemainingMs(state, nowMs, plan);
    const prev = prevRestRemainingRef.current;
    if (prev !== null && prev > 0 && remaining !== null && remaining <= 0) {
      navigator.vibrate?.(200);
    }
    prevRestRemainingRef.current = remaining;
  }, [state, nowMs, plan]);

  async function finish(notes?: string): Promise<void> {
    const current = stateRef.current;
    const unsaved = unsavedClosedSegments(current);
    if (unsaved.length > 0) {
      // Let a failure propagate — the caller shows an error and must NOT end the session.
      await flushSegments(sessionId, plan, unsaved);
      dispatch({ type: "markSaved", count: current.persistedCount + unsaved.length });
    }
    await endSession({ data: { sessionId, notes } });
    try {
      localStorage.removeItem(liveStateKey(sessionId));
    } catch {
      // Best-effort cleanup only — the session is already ended server-side.
    }
    await router.invalidate();
  }

  return {
    state,
    plan,
    nowMs,
    tap: () => dispatch({ type: "tap", atMs: Date.now() }),
    undo: () => dispatch({ type: "undo", atMs: Date.now() }),
    pauseToggle: () => dispatch({ type: "pauseToggle", atMs: Date.now() }),
    endBlockEarly: () => dispatch({ type: "endBlockEarly", atMs: Date.now() }),
    extraRound: () => dispatch({ type: "extraRound", atMs: Date.now() }),
    syncError,
    finish,
  };
}
