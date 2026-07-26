import { useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { liveStateKey, parseLiveState, serializeLiveState } from "@/features/strength/lib/hyrox-live-store";
import { createHyroxSounds } from "@/features/strength/lib/hyrox-sounds";
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
          // Clamp to the server's zod max — an overnight-abandoned tab must not brick every subsequent flush/finish.
          durationMs: Math.min(seg.durationMs ?? 0, 86_400_000),
        })),
      },
    });
  }
}

export interface UseHyroxLiveOptions {
  // Ended sessions render this hook's state read-only (HyroxDoneSummary from
  // the loader's segments) — false skips the rAF loop, wake lock, sounds, and
  // flush triggers entirely, since none of them have anything left to do.
  enabled?: boolean;
}

export function useHyroxLive(
  sessionId: string,
  steps: LoaderStep[],
  persisted: PersistedSegment[],
  options?: UseHyroxLiveOptions,
): HyroxLive {
  const enabled = options?.enabled ?? true;
  const router = useRouter();
  const plan = useMemo(() => buildPlan(steps), [steps]);

  const [state, setState] = useState<HyroxTimerState>(() => {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(liveStateKey(sessionId));
    const fromStorage = parseLiveState(sessionId, raw);
    // Invariant: blockIndex must stay < plan.length — every live screen indexes
    // plan[state.blockIndex] directly. A plan shrink (block dropped) after the
    // state was persisted can leave a stale storage entry pointing past the end
    // of the now-shorter plan; fall through to the next source instead of
    // crashing on every reload. (rehydrateFromSegments is already bounds-safe:
    // it only considers segments whose blockId still exists in plan.)
    if (fromStorage && (plan.length === 0 || fromStorage.blockIndex < plan.length)) return fromStorage;
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
  // Seeded from the current phase (not a fixed literal) so rehydrating mid-rest
  // or mid-blockDone doesn't read as a fresh transition on mount.
  const prevPhaseRef = useRef(state.phase);
  const sounds = useMemo(() => createHyroxSounds(), []);

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
    if (!enabled) return;
    if (next.phase !== "rest" && next.phase !== "blockDone" && next.phase !== "done") return;
    if (unsavedClosedSegments(next).length === 0) return;
    void runFlush();
  }

  // Undo can reopen the just-flushed segment while the save request is still
  // in flight; if so, mark one fewer as saved. Accepted residue: the server
  // keeps the pre-undo duration for that segment (insert-ignore contract on
  // (blockId, roundNumber, orderIndex)), local state simply stays consistent.
  // Clamped to the closed prefix: two undos in one in-flight flush can shrink
  // segments below count-1, so `segments[count-1]` alone isn't enough — never
  // mark more than what's actually closed right now.
  function safeMarkSavedCount(count: number): number {
    const segments = stateRef.current.segments;
    const reopened = segments[count - 1];
    const adjustedCount = reopened && reopened.durationMs === null ? count - 1 : count;
    const firstOpenIndex = segments.findIndex((s) => s.durationMs === null);
    const closedPrefixLen = firstOpenIndex === -1 ? segments.length : firstOpenIndex;
    return Math.min(adjustedCount, closedPrefixLen);
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
      dispatch({ type: "markSaved", count: safeMarkSavedCount(current.persistedCount + unsaved.length) });
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
    if (!enabled) return;
    const onOnline = () => void runFlush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [enabled]);

  // Fresh timestamp for the first render after any event, even while ticking
  // is otherwise paused/idle.
  // biome-ignore lint/correctness/useExhaustiveDependencies: state is a trigger, not read — this must re-run on every dispatch.
  useEffect(() => {
    setNowMs(Date.now());
  }, [state]);

  const hasTail = state.segments.length > 0 && state.segments[state.segments.length - 1].durationMs === null;
  const paused = state.pausedAtMs !== null;
  const ticking = enabled && (hasTail || state.phase === "rest") && !paused;

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
  const shouldHoldWakeLock = enabled && needsWakeLock(state);
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
        // The browser can release the lock on its own (e.g. tab backgrounded)
        // without us calling .release() — null the ref then so the
        // visibilitychange reacquire doesn't see a stale sentinel and bail.
        sentinel?.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        });
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
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (wakeLockRef.current || !needsWakeLock(stateRef.current)) return;
      navigator.wakeLock
        ?.request("screen")
        .then((sentinel) => {
          // The phase may have moved past the wake-lock window while this
          // request was resolving — release immediately instead of storing.
          if (!needsWakeLock(stateRef.current)) {
            void sentinel.release().catch(() => {});
            return;
          }
          // The acquire effect may have already stored a fresh sentinel while
          // this one was resolving — don't clobber it, release the redundant one.
          if (wakeLockRef.current !== null) {
            void sentinel.release().catch(() => {});
            return;
          }
          sentinel.addEventListener("release", () => {
            if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
          });
          wakeLockRef.current = sentinel;
        })
        .catch(() => {
          // Unsupported or refused — no-op.
        });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled]);

  // Rest countdown edges (level crossings, not levels): 15s-to-go warns with a
  // beep, 0-crossing rings the end bell. Both fire at most once per crossing.
  // The 15s warning is skipped for short rests (<20s declared) — it would
  // overlap the end bell into noise.
  useEffect(() => {
    if (!enabled) return;
    const remaining = restRemainingMs(state, nowMs, plan);
    const prev = prevRestRemainingRef.current;
    const restSeconds = plan[state.blockIndex]?.restSeconds ?? null;
    if (prev !== null && remaining !== null) {
      if (prev > 0 && remaining <= 0) {
        sounds.endBell();
        navigator.vibrate?.(400);
      } else if (restSeconds !== null && restSeconds >= 20 && prev > 15_000 && remaining <= 15_000) {
        sounds.warnBeep();
        navigator.vibrate?.(100);
      }
    }
    prevRestRemainingRef.current = remaining;
  }, [state, nowMs, plan, sounds, enabled]);

  // Round-end gong: fires on entering `rest` or `blockDone` — a different edge
  // from the effect above, which fires on the countdown *leaving* rest (the
  // 0-crossing), not on phase changing. No double-fire between the two.
  useEffect(() => {
    if (!enabled) return;
    const prev = prevPhaseRef.current;
    if ((prev !== "rest" && state.phase === "rest") || (prev !== "blockDone" && state.phase === "blockDone")) {
      sounds.roundGong();
      navigator.vibrate?.([200, 100, 200]);
    }
    prevPhaseRef.current = state.phase;
  }, [state.phase, sounds, enabled]);

  async function finish(notes?: string): Promise<void> {
    const current = stateRef.current;
    const unsaved = unsavedClosedSegments(current);
    if (unsaved.length > 0) {
      // Let a failure propagate — the caller shows an error and must NOT end the session.
      await flushSegments(sessionId, plan, unsaved);
      dispatch({ type: "markSaved", count: safeMarkSavedCount(current.persistedCount + unsaved.length) });
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
    tap: () => {
      sounds.unlock();
      dispatch({ type: "tap", atMs: Date.now() });
    },
    undo: () => dispatch({ type: "undo", atMs: Date.now() }),
    pauseToggle: () => dispatch({ type: "pauseToggle", atMs: Date.now() }),
    endBlockEarly: () => dispatch({ type: "endBlockEarly", atMs: Date.now() }),
    extraRound: () => dispatch({ type: "extraRound", atMs: Date.now() }),
    syncError,
    finish,
  };
}
