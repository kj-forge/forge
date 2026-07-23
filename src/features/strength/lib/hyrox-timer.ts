// Pure Hyrox live-session stopwatch reducer. No wall-clock reads: every event
// carries atMs (epoch ms) and pause freezes a virtual clock derived from it.
//
// Map of the machine below (`tap` is the only forward driver of phase;
// undo/pauseToggle/extraRound/endBlockEarly/markSaved are annotated as notes
// because they either move backward in time, don't touch phase at all, or
// only apply from one specific phase — see docs/learning/hyrox-live-timing.md
// §8 for the same thing as a grep-able event→transition table).
//
// ```mermaid
// stateDiagram-v2
//     [*] --> idle
//     idle --> station: tap (opens STATION)
//     station --> rox: tap (not last station in block)
//     station --> rest: tap (last station, round < effectiveRounds)
//     station --> blockDone: tap (last station, round >= effectiveRounds)
//     rox --> station: tap (next stationIndex, opens STATION)
//     rest --> station: tap (opens STATION for round + 1)
//     blockDone --> idle: tap (blockIndex + 1 < plan.length)
//     blockDone --> done: tap (last block)
//     blockDone --> rest: extraRound (opens a new REST for the current round)
//     rest --> blockDone: endBlockEarly (closes the open REST early)
//     done --> done: tap (no-op)
//
//     note right of rest
//         REST's roundNumber is the round it CLOSES, not the
//         one that follows: REST after round 1 carries
//         roundNumber = 1, even though the STATION opened by
//         the next tap starts round = 2. rehydrateFromSegments
//         and saveHyroxSegments both depend on this.
//     end note
//
//     note right of station
//         undo (no edge above - it moves backward) reopens the
//         most recently CLOSED segment and sets phase back to
//         match its kind (STATION/ROX_ZONE/REST -> station/rox/
//         rest). canUndo() blocks it once that segment's index
//         is < persistedCount (already flushed to the server)
//         or belongs to a previous block - the undo boundary is
//         always the persisted/unpersisted line, never earlier.
//     end note
//
//     note left of idle
//         pauseToggle only freezes/thaws the virtual clock
//         (vnow) - phase never changes. markSaved only advances
//         persistedCount (the already-flushed prefix of
//         segments) - phase never changes there either.
//     end note
// ```

export type HyroxPhase = "idle" | "station" | "rox" | "rest" | "blockDone" | "done";

export interface HyroxStationPlan {
  blockMovementId: string;
  label: string;
  target: string | null;
}

export interface HyroxBlockPlan {
  blockId: string;
  targetRounds: number;
  restSeconds: number | null;
  stations: HyroxStationPlan[];
}

export interface LiveSegment {
  kind: "STATION" | "ROX_ZONE" | "REST";
  blockIndex: number;
  roundNumber: number;
  orderIndex: number;
  blockMovementId: string | null;
  startMs: number; // virtual (pause-adjusted) epoch ms
  durationMs: number | null; // null = the single running tail
}

export interface HyroxTimerState {
  phase: HyroxPhase;
  blockIndex: number;
  round: number;
  stationIndex: number;
  extraRounds: Record<number, number>;
  segments: LiveSegment[];
  persistedCount: number; // prefix of segments already saved server-side
  pausedAtMs: number | null;
  pausedTotalMs: number;
}

export type HyroxTimerEvent =
  | { type: "tap"; atMs: number }
  | { type: "undo"; atMs: number }
  | { type: "pauseToggle"; atMs: number }
  | { type: "endBlockEarly"; atMs: number }
  | { type: "extraRound"; atMs: number }
  | { type: "markSaved"; count: number };

export interface PersistedSegment {
  blockId: string;
  roundNumber: number;
  orderIndex: number;
  kind: LiveSegment["kind"];
  blockMovementId: string | null;
  durationMs: number;
}

export function initialTimerState(): HyroxTimerState {
  return {
    phase: "idle",
    blockIndex: 0,
    round: 1,
    stationIndex: 0,
    extraRounds: {},
    segments: [],
    persistedCount: 0,
    pausedAtMs: null,
    pausedTotalMs: 0,
  };
}

// Pause freezes time: while paused, vnow stays pinned at (pausedAtMs - pausedTotalMs)
// regardless of atMs; resuming folds the paused span into pausedTotalMs.
function vnow(state: HyroxTimerState, atMs: number): number {
  return (state.pausedAtMs ?? atMs) - state.pausedTotalMs;
}

function closeTail(segments: LiveSegment[], state: HyroxTimerState, atMs: number): LiveSegment[] {
  if (segments.length === 0) return segments;
  const last = segments[segments.length - 1];
  if (last.durationMs !== null) return segments;
  const closed: LiveSegment = { ...last, durationMs: vnow(state, atMs) - last.startMs };
  return [...segments.slice(0, -1), closed];
}

function openSeg(
  segments: LiveSegment[],
  kind: LiveSegment["kind"],
  blockIndex: number,
  roundNumber: number,
  blockMovementId: string | null,
  startMs: number,
): LiveSegment[] {
  const orderIndex = segments.filter((s) => s.blockIndex === blockIndex).length;
  const seg: LiveSegment = { kind, blockIndex, roundNumber, orderIndex, blockMovementId, startMs, durationMs: null };
  return [...segments, seg];
}

function handleTap(state: HyroxTimerState, plan: HyroxBlockPlan[], atMs: number): HyroxTimerState {
  const block = plan[state.blockIndex];

  switch (state.phase) {
    case "idle": {
      // Resumes at whatever stationIndex the state already carries (0 for a
      // fresh block, or a rehydrated mid-round position) — never reset here.
      if (plan.length === 0 || !block || block.stations.length === 0) return state;
      const station = block.stations[state.stationIndex];
      const segments = openSeg(
        state.segments,
        "STATION",
        state.blockIndex,
        state.round,
        station.blockMovementId,
        vnow(state, atMs),
      );
      return { ...state, phase: "station", segments };
    }
    case "station": {
      const closed = closeTail(state.segments, state, atMs);
      const isLastStation = state.stationIndex === block.stations.length - 1;
      if (!isLastStation) {
        const segments = openSeg(closed, "ROX_ZONE", state.blockIndex, state.round, null, vnow(state, atMs));
        return { ...state, phase: "rox", segments };
      }
      const rounds = effectiveRounds(state, plan, state.blockIndex);
      if (state.round >= rounds) {
        return { ...state, phase: "blockDone", segments: closed };
      }
      // REST carries the roundNumber of the round it closes, not the next one.
      const segments = openSeg(closed, "REST", state.blockIndex, state.round, null, vnow(state, atMs));
      return { ...state, phase: "rest", segments };
    }
    case "rox": {
      const closed = closeTail(state.segments, state, atMs);
      const nextStation = state.stationIndex + 1;
      const segments = openSeg(
        closed,
        "STATION",
        state.blockIndex,
        state.round,
        block.stations[nextStation].blockMovementId,
        vnow(state, atMs),
      );
      return { ...state, phase: "station", stationIndex: nextStation, segments };
    }
    case "rest": {
      const closed = closeTail(state.segments, state, atMs);
      const nextRound = state.round + 1;
      const segments = openSeg(
        closed,
        "STATION",
        state.blockIndex,
        nextRound,
        block.stations[0].blockMovementId,
        vnow(state, atMs),
      );
      return { ...state, phase: "station", round: nextRound, stationIndex: 0, segments };
    }
    case "blockDone": {
      if (state.blockIndex + 1 < plan.length) {
        return { ...state, phase: "idle", blockIndex: state.blockIndex + 1, round: 1, stationIndex: 0 };
      }
      return { ...state, phase: "done" };
    }
    case "done":
      return state;
  }
}

function stationIndexFor(seg: LiveSegment, plan: HyroxBlockPlan[], segments: LiveSegment[], idx: number): number {
  const stations = plan[seg.blockIndex].stations;
  if (seg.kind === "STATION") {
    return stations.findIndex((s) => s.blockMovementId === seg.blockMovementId);
  }
  if (seg.kind === "REST") {
    return stations.length - 1;
  }
  // ROX_ZONE never carries a blockMovementId: it always immediately follows
  // the station it belongs to, so recover the station index from that neighbor.
  const prev = segments[idx - 1];
  return stations.findIndex((s) => s.blockMovementId === prev.blockMovementId);
}

function handleUndo(state: HyroxTimerState, plan: HyroxBlockPlan[]): HyroxTimerState {
  if (!canUndo(state)) return state;
  const hasTail = state.segments.length > 0 && state.segments[state.segments.length - 1].durationMs === null;
  const segments = hasTail ? state.segments.slice(0, -1) : state.segments.slice();
  const idx = segments.length - 1;
  const seg = segments[idx];
  const reopened: LiveSegment = { ...seg, durationMs: null };
  const newSegments = [...segments.slice(0, idx), reopened];
  const stationIndex = stationIndexFor(seg, plan, segments, idx);
  const phase: HyroxPhase = seg.kind === "STATION" ? "station" : seg.kind === "ROX_ZONE" ? "rox" : "rest";
  return { ...state, phase, blockIndex: seg.blockIndex, round: seg.roundNumber, stationIndex, segments: newSegments };
}

function handlePauseToggle(state: HyroxTimerState, atMs: number): HyroxTimerState {
  if (state.pausedAtMs === null) {
    return { ...state, pausedAtMs: atMs };
  }
  return { ...state, pausedAtMs: null, pausedTotalMs: state.pausedTotalMs + (atMs - state.pausedAtMs) };
}

function handleEndBlockEarly(state: HyroxTimerState, atMs: number): HyroxTimerState {
  if (state.phase !== "rest") return state;
  const closed = closeTail(state.segments, state, atMs);
  return { ...state, phase: "blockDone", segments: closed };
}

function handleExtraRound(state: HyroxTimerState, atMs: number): HyroxTimerState {
  // Undo after extraRound leaves extraRounds incremented (accepted): endBlockEarly is the escape hatch.
  if (state.phase !== "blockDone") return state;
  const extraRounds = { ...state.extraRounds, [state.blockIndex]: (state.extraRounds[state.blockIndex] ?? 0) + 1 };
  const segments = openSeg(state.segments, "REST", state.blockIndex, state.round, null, vnow(state, atMs));
  return { ...state, phase: "rest", extraRounds, segments };
}

export function hyroxTimerReducer(
  state: HyroxTimerState,
  plan: HyroxBlockPlan[],
  event: HyroxTimerEvent,
): HyroxTimerState {
  switch (event.type) {
    case "tap":
      return handleTap(state, plan, event.atMs);
    case "undo":
      return handleUndo(state, plan);
    case "pauseToggle":
      return handlePauseToggle(state, event.atMs);
    case "endBlockEarly":
      return handleEndBlockEarly(state, event.atMs);
    case "extraRound":
      return handleExtraRound(state, event.atMs);
    case "markSaved":
      return { ...state, persistedCount: Math.max(state.persistedCount, event.count) };
  }
}

export function rehydrateFromSegments(plan: HyroxBlockPlan[], persisted: PersistedSegment[]): HyroxTimerState {
  const blockIndexOf = (blockId: string) => plan.findIndex((b) => b.blockId === blockId);
  // Does NOT assume the loader delivers segments in any particular cross-block
  // order (blockId is a random UUID, not a plan-order key): the resume block
  // is the furthest one reached in PLAN order (blocks only ever advance
  // forward), found via max(blockIndexOf) below. Within that block, the
  // round/station math already uses max()/counts over its segments, so it is
  // robust to within-block ordering too.
  const known = persisted.filter((p) => blockIndexOf(p.blockId) !== -1);
  if (known.length === 0) return initialTimerState();

  // No wall-clock data survives a crash: closed segments get a synthetic
  // cumulative startMs (per block) since only their durationMs is ever read.
  const offsets: Record<number, number> = {};
  const segments: LiveSegment[] = known.map((p) => {
    const blockIndex = blockIndexOf(p.blockId);
    const startMs = offsets[blockIndex] ?? 0;
    offsets[blockIndex] = startMs + p.durationMs;
    return {
      kind: p.kind,
      blockIndex,
      roundNumber: p.roundNumber,
      orderIndex: p.orderIndex,
      blockMovementId: p.blockMovementId,
      startMs,
      durationMs: p.durationMs,
    };
  });

  const blockIndex = Math.max(...known.map((p) => blockIndexOf(p.blockId)));
  const block = plan[blockIndex];
  const blockSegs = known.filter((p) => blockIndexOf(p.blockId) === blockIndex);
  const maxRound = Math.max(...blockSegs.map((s) => s.roundNumber));
  const completedStations = blockSegs.filter((s) => s.roundNumber === maxRound && s.kind === "STATION").length;
  const roundComplete = completedStations === block.stations.length;
  const extra = Math.max(0, maxRound - block.targetRounds);
  const extraRounds: Record<number, number> = extra > 0 ? { [blockIndex]: extra } : {};
  const blockComplete = roundComplete && maxRound >= block.targetRounds + extra;

  let phase: HyroxPhase;
  let round: number;
  let stationIndex: number;
  if (blockComplete) {
    phase = "blockDone";
    round = maxRound;
    stationIndex = 0;
  } else if (roundComplete) {
    phase = "idle";
    round = maxRound + 1;
    stationIndex = 0;
  } else {
    // Mid-round crash: resume at the next station boundary, not a round
    // replay — the pending rox/running segment at crash time is dropped.
    phase = "idle";
    round = maxRound;
    stationIndex = completedStations;
  }

  return {
    phase,
    blockIndex,
    round,
    stationIndex,
    extraRounds,
    segments,
    persistedCount: segments.length,
    pausedAtMs: null,
    pausedTotalMs: 0,
  };
}

export function canUndo(state: HyroxTimerState): boolean {
  if (state.phase === "idle" || state.phase === "done") return false;
  const hasTail = state.segments.length > 0 && state.segments[state.segments.length - 1].durationMs === null;
  const lastClosedIndex = hasTail ? state.segments.length - 2 : state.segments.length - 1;
  if (lastClosedIndex < 0) return false;
  const seg = state.segments[lastClosedIndex];
  return lastClosedIndex >= state.persistedCount && seg.blockIndex === state.blockIndex;
}

export function runningMs(state: HyroxTimerState, atMs: number): number {
  if (state.segments.length === 0) return 0;
  const tail = state.segments[state.segments.length - 1];
  if (tail.durationMs !== null) return 0;
  return vnow(state, atMs) - tail.startMs;
}

function sumSegments(state: HyroxTimerState, atMs: number, predicate: (s: LiveSegment) => boolean): number {
  let total = 0;
  for (const s of state.segments) {
    if (!predicate(s)) continue;
    total += s.durationMs !== null ? s.durationMs : vnow(state, atMs) - s.startMs;
  }
  return total;
}

export function roundMs(state: HyroxTimerState, atMs: number, blockIndex: number, round: number): number {
  return sumSegments(state, atMs, (s) => s.blockIndex === blockIndex && s.roundNumber === round && s.kind !== "REST");
}

export function roxMs(state: HyroxTimerState, atMs: number, blockIndex: number, round: number): number {
  return sumSegments(
    state,
    atMs,
    (s) => s.blockIndex === blockIndex && s.roundNumber === round && s.kind === "ROX_ZONE",
  );
}

export function blockMs(state: HyroxTimerState, atMs: number, blockIndex: number): number {
  return sumSegments(state, atMs, (s) => s.blockIndex === blockIndex);
}

export function restRemainingMs(state: HyroxTimerState, atMs: number, plan: HyroxBlockPlan[]): number | null {
  if (state.phase !== "rest") return null;
  const block = plan[state.blockIndex];
  if (block.restSeconds === null) return null;
  const tail = state.segments[state.segments.length - 1];
  const elapsed = vnow(state, atMs) - tail.startMs;
  return block.restSeconds * 1000 - elapsed;
}

export function effectiveRounds(state: HyroxTimerState, plan: HyroxBlockPlan[], blockIndex: number): number {
  return plan[blockIndex].targetRounds + (state.extraRounds[blockIndex] ?? 0);
}

export function unsavedClosedSegments(state: HyroxTimerState): LiveSegment[] {
  return state.segments.filter((s, i) => s.durationMs !== null && i >= state.persistedCount);
}
