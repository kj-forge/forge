# Hyrox live timing — a map into `hyrox-timer.ts`

The Stage 2 live stopwatch (coach taps through stations/rox-zones/rest, the app
times everything) turned out to be the densest piece of logic in Forge so far:
one file (`hyrox-timer.ts`) is a hand-written finite state machine with a
virtual pause clock, two independent crash-recovery paths, and an undo
boundary that has to agree with a server flush happening concurrently. This
doc exists so that in five months "why does REST carry the previous round's
number?" has an answer that isn't "re-read 360 lines and rebuild the mental
model from scratch."

> Sibling docs: [`server-functions.md`](server-functions.md) for the
> `createServerFn`/Zod/auth pattern `saveHyroxSegments` also follows,
> [`upsert-and-composite-unique.md`](upsert-and-composite-unique.md) for the
> general idempotent-write pattern this reuses. Rationale for the schema shape
> lives in [ADR-0023](../adr/ADR-0023-hyrox-training-data-model.md).

Files this doc is about:

| File | Role |
|---|---|
| `src/features/strength/lib/hyrox-timer.ts` | The reducer: pure state machine + selectors. No React, no I/O. |
| `src/features/strength/lib/hyrox-timer.test.ts` | Behavioural spec of the reducer — a `driver()` harness that plays back a timeline. |
| `src/features/strength/lib/hyrox-live-store.ts` | Serializes/parses the reducer's state to/from `localStorage`. |
| `src/features/strength/lib/hyrox-sounds.ts` | WebAudio countdown cues (no audio files). |
| `src/features/strength/components/useHyroxLive.ts` | The hook: wires the reducer to React, drives the flush/wake-lock/sound side effects. |
| `src/features/strength/server/segments.ts` | `saveHyroxSegments` — the idempotent batch write + `sets` mirror. |

## 1. Why a pure reducer keyed on epoch milliseconds

`hyroxTimerReducer(state, plan, event)` never calls `Date.now()` itself.
Every event that needs "now" carries it explicitly:

```ts
export type HyroxTimerEvent =
  | { type: "tap"; atMs: number }
  | { type: "undo"; atMs: number }
  | { type: "pauseToggle"; atMs: number }
  | { type: "endBlockEarly"; atMs: number }
  | { type: "extraRound"; atMs: number }
  | { type: "markSaved"; count: number };
```

Three things fall out of that one design choice, in order of how much they
actually mattered while building this:

- **Tests never touch a clock.** `hyrox-timer.test.ts`'s `driver()` helper
  is a closure holding a plain number `t` — `.adv(90_000)` just does `t +=
  90_000`, then the next `.tap()` passes that `t` as `atMs`. No `vi.useFakeTimers()`,
  no `bun:test` clock mocking, no flaky timing-dependent assertions. A whole
  30-minute Hyrox block replays in a test in microseconds because "time" is
  just an integer the test controls.
- **State is trivially serializable.** `HyroxTimerState` is plain numbers,
  strings, and arrays — no `Date` objects, no closures, no class instances.
  `JSON.stringify(state)` round-trips perfectly, which is exactly what
  `hyrox-live-store.ts` does to persist it to `localStorage` on every
  dispatch (§3).
- **Determinism makes undo/rehydrate tractable.** Given the same `(state,
  plan, event)` triple you always get the same result — so "what would the
  state look like if I replayed events up to here" and "can I reconstruct a
  plausible state from a handful of persisted segments" (§3, `rehydrateFromSegments`)
  are both just pure functions of data, not "reconstruct whatever the wall
  clock happened to be doing."

The trade-off: the reducer trusts whatever `atMs` it's handed. `useHyroxLive.ts`
is the only caller, and it always passes `Date.now()` (§5 explains why not
`performance.now()`). The reducer itself has zero opinion about where `atMs`
comes from — that's the point of keeping it pure.

## 2. The virtual pause clock

A segment's `durationMs` shouldn't include time spent paused. Rather than
stopping and restarting timers, the reducer keeps a running "virtual now"
function:

```ts
function vnow(state: HyroxTimerState, atMs: number): number {
  return (state.pausedAtMs ?? atMs) - state.pausedTotalMs;
}
```

Two branches:

- **Not paused** (`pausedAtMs === null`): `vnow` tracks real time minus all
  paused spans accumulated so far. Every open segment's elapsed time is
  `vnow(state, atMs) - segment.startMs` — real elapsed time with paused
  chunks subtracted out.
- **Paused** (`pausedAtMs !== null`): `vnow` is pinned at `pausedAtMs -
  pausedTotalMs` no matter what `atMs` comes in. The virtual clock literally
  stops moving while paused, even though the real `atMs` the rAF loop feeds
  in keeps climbing every frame.

Resuming folds the paused span into the accumulator:

```ts
function handlePauseToggle(state: HyroxTimerState, atMs: number): HyroxTimerState {
  if (state.pausedAtMs === null) return { ...state, pausedAtMs: atMs };
  return { ...state, pausedAtMs: null, pausedTotalMs: state.pausedTotalMs + (atMs - state.pausedAtMs) };
}
```

Worked example (from `hyrox-timer.test.ts`):

```
tap() at t=0            → station opens, startMs = 0
adv(10_000)              → t = 10_000
pause() at t=10_000      → pausedAtMs = 10_000
adv(60_000)               → t = 70_000, but vnow stays pinned at 10_000 - 0 = 10_000
runningMs(state, 70_000) → 10_000                       (the 60s of pause is invisible)
pause() (resume) at t=70_000 → pausedTotalMs += 70_000 - 10_000 = 60_000; pausedAtMs = null
adv(5_000)                → t = 75_000
runningMs(state, 75_000) → vnow = 75_000 - 60_000 = 15_000 → 15_000 - startMs(0) = 15_000
```

The station shows 15 s of real work time, not the 75 s of wall-clock time
that actually elapsed — the 60 s pause never leaks into any segment's
duration, any selector (`roundMs`, `blockMs`, `roxMs` all go through the same
`vnow`), or the eventual `durationMs` saved to the server.

## 3. Two independent layers of crash recovery

A phone can die mid-round. Forge has two recovery paths, deliberately of
different precision, because they answer different questions.

### Layer 1 (fast, exact): the `localStorage` journal

Every `dispatch()` in `useHyroxLive.ts` writes the *entire* reducer state to
`localStorage` right after computing it:

```ts
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
```

`hyrox-live-store.ts` wraps it in a versioned envelope (`{ v: 1, sessionId,
state }`) and checks both the version tag and that `sessionId` matches before
trusting it — a stale key from a *different* session (same browser, earlier
Hyrox workout) must never rehydrate the wrong session. On mount,
`useHyroxLive` tries this path first:

```ts
const [state, setState] = useState<HyroxTimerState>(() => {
  const raw = typeof window === "undefined" ? null : localStorage.getItem(liveStateKey(sessionId));
  const fromStorage = parseLiveState(sessionId, raw);
  if (fromStorage) return fromStorage;
  if (persisted.length > 0) return rehydrateFromSegments(plan, persisted);
  return initialTimerState();
});
```

Because the whole state (including the exact `startMs` of the open tail
segment) is right there, reload/tab-kill-and-reopen on the *same device*
resumes to the exact millisecond — the running segment keeps counting from
precisely where it was, mid-tap.

### Layer 2 (coarse, approximate): `rehydrateFromSegments`

If there's no `localStorage` entry (different device, storage cleared, private
mode threw on write) the fallback reconstructs state from whatever segments
already made it to the DB via `saveHyroxSegments` (§4):

```ts
export function rehydrateFromSegments(plan: HyroxBlockPlan[], persisted: PersistedSegment[]): HyroxTimerState {
  // ...
}
```

Why this can only ever be approximate: **no wall-clock data survives a
crash without layer 1.** Only `durationMs` of already-*closed* segments made
it to the server — never the exact instant the crash happened, and never the
partial duration of whatever segment was still open at that instant. So this
path:

- Assigns each closed segment a **synthetic** `startMs` — a running
  cumulative offset per block, since nothing reads `startMs` here except to
  derive `durationMs` back out, and the segments already carry `durationMs`
  directly.
- Figures out "how far did we get" by counting completed stations in the
  highest `roundNumber` seen, and picks one of three landings:
  - **round complete** → `phase: "idle"`, `round: maxRound + 1`,
    `stationIndex: 0` (ready for the next tap to open the first station of
    the new round).
  - **round incomplete** (mid-round crash) → `phase: "idle"`, `round:
    maxRound`, `stationIndex: completedStations` — resumes at the **next
    station boundary**, not mid-station. Whatever rox-zone/station segment
    was open at crash time is simply dropped; it was never persisted, so
    there's nothing to resume it from.
  - **block complete** (rounds ≥ target + any extra rounds) → `phase:
    "blockDone"`.

The trade-off is explicit in the code comment: *"Mid-round crash: resume at
the next station boundary, not a round replay — the pending rox/running
segment at crash time is dropped."* Losing a partial station's time on a
device-swap crash is an acceptable gap; silently fabricating a plausible
`startMs`/duration for data that was never observed would not be.

`persistedCount` is set to `segments.length` on rehydrate — every segment
this path reconstructs is, by definition, already in the DB, so `canUndo()`
correctly refuses to undo across a rehydrate boundary (§6).

## 4. Idempotent batch flush + the `sets` mirror

`maybeFlush` triggers a save whenever the phase lands on a boundary (`rest`,
`blockDone`, `done`) and there are closed-but-unsaved segments:

```ts
function maybeFlush(next: HyroxTimerState) {
  if (!enabled) return;
  if (next.phase !== "rest" && next.phase !== "blockDone" && next.phase !== "done") return;
  if (unsavedClosedSegments(next).length === 0) return;
  void runFlush();
}
```

`unsavedClosedSegments` is the boundary itself: everything closed
(`durationMs !== null`) at or after `persistedCount`:

```ts
export function unsavedClosedSegments(state: HyroxTimerState): LiveSegment[] {
  return state.segments.filter((s, i) => s.durationMs !== null && i >= state.persistedCount);
}
```

The batch is sent to `saveHyroxSegments`, which inserts with
`onConflictDoNothing` on a unique `(blockId, roundNumber, orderIndex)` index:

```ts
const inserted = await tx
  .insert(sessionSegments)
  .values(/* ... */)
  .onConflictDoNothing({
    target: [sessionSegments.blockId, sessionSegments.roundNumber, sessionSegments.orderIndex],
  })
  .returning({ roundNumber: sessionSegments.roundNumber, orderIndex: sessionSegments.orderIndex });
```

A retried flush (flaky network, the client resending a batch it's unsure
landed) simply inserts nothing new for rows already there — no duplicate
rows, no error. `.returning()` tells the handler exactly **which** rows this
call actually inserted, and that set drives the second write:

```ts
const insertedKeys = new Set(inserted.map((r) => `${r.roundNumber}:${r.orderIndex}`));
const mirror = args.segments.filter(
  (s) => s.kind === "STATION" && insertedKeys.has(`${s.roundNumber}:${s.orderIndex}`),
);
if (mirror.length > 0) {
  await tx.insert(sets).values(/* setNumber = roundNumber, durationSeconds = round(durationMs/1000), kind = WORK */);
}
```

Why match by `(roundNumber, orderIndex)` and not row id: the payload the
client resent on retry has no ids yet (they're server-generated on insert),
and a naive "mirror every STATION in this call" would double-insert a `sets`
row every time a batch got retried. Matching against the *actual DB-reported
inserted set* is what keeps `sets` — the table exercise history/PR pipelines
already read — a strict 1:1 projection of `session_segments`, no matter how
many times a batch gets retried. Both writes happen in one transaction, so
they can never drift relative to each other.

## 5. Wake lock + background throttling — why `Date.now()`, not `performance.now()`

Two separate problems, one answer.

**Problem 1 — the screen must stay on.** A Hyrox athlete's phone is on a
stand or in a pocket, not being tapped continuously — if the screen locks,
the tap that should close a station never lands and the segment silently
keeps running. `useHyroxLive.ts` holds a `WakeLockSentinel` for the whole
live session (everything except the untouched start and the finished end):

```ts
function needsWakeLock(state: HyroxTimerState): boolean {
  if (state.phase === "done") return false;
  if (state.phase === "idle" && state.blockIndex === 0 && state.segments.length === 0) return false;
  return true;
}
```

Chrome silently drops wake locks when a tab is backgrounded, without ever
calling `.release()` on our sentinel — so a `visibilitychange` listener
reacquires it once the tab is visible again, and the acquire effect nulls
`wakeLockRef.current` on the sentinel's own `"release"` event so a stale ref
never blocks a legitimate reacquire.

**Problem 2 — the clock itself must survive backgrounding correctly.** This is
where `Date.now()` over `performance.now()` matters, and it's not about
precision (both are sub-millisecond) — it's about **what the number means
across a page reload**:

- `performance.now()` is relative to *navigation start* — it resets to ~0
  every time the page loads. A `startMs` captured from `performance.now()`
  before a tab kill is meaningless after the tab reopens: the new page has a
  brand new performance-time origin, so subtracting the old value from a
  fresh `performance.now()` produces garbage (or a huge number), not "how
  much real time passed."
- `Date.now()` is epoch time — a `startMs` value means the same thing before
  and after a reload, on this device or a different one, today or in a
  server-side rehydrate next week. Since `startMs` values get serialized to
  `localStorage` (§3, layer 1) and `durationMs` values get serialized to the
  DB (§4) and later read back by `rehydrateFromSegments`, they have to
  survive exactly that kind of page-lifecycle boundary. `performance.now()`
  values would not.

The rAF loop that drives the visible clock (`nowMs`) is throttled/paused by
the browser while the tab is backgrounded — that's fine, because nothing in
the reducer depends on the loop firing at any particular rate. Whatever
`Date.now()` the loop reads on the *next* frame after the tab comes back
correctly reflects the real elapsed wall-clock time, including all the
backgrounded time, because it's still the same epoch clock the whole segment
timeline is built on.

## 6. Undo boundaries — the `persistedCount` line

`persistedCount` is the length of the prefix of `segments` already
acknowledged by the server. `canUndo()` enforces two rules at once:

```ts
export function canUndo(state: HyroxTimerState): boolean {
  if (state.phase === "idle" || state.phase === "done") return false;
  const hasTail = state.segments.length > 0 && state.segments[state.segments.length - 1].durationMs === null;
  const lastClosedIndex = hasTail ? state.segments.length - 2 : state.segments.length - 1;
  if (lastClosedIndex < 0) return false;
  const seg = state.segments[lastClosedIndex];
  return lastClosedIndex >= state.persistedCount && seg.blockIndex === state.blockIndex;
}
```

1. **Never undo something already flushed.** `lastClosedIndex >=
   persistedCount` — once a segment has been (or might have been)
   acknowledged by the server, the client no longer owns it.
2. **Never undo across a block boundary.** `seg.blockIndex ===
   state.blockIndex` — stepping back into a *previous, already-completed*
   block isn't a thing the UI supports; `endBlockEarly` is the only sanctioned
   way to leave a block once you're past it.

The tricky part isn't the reducer — it's that a flush can be **in flight**
while the user hits undo. `useHyroxLive.ts`'s `runFlush()` awaits the server
call, and only *after* it resolves does it dispatch `markSaved`. If undo fires
in that window, the segment the server is about to acknowledge is no longer
the last *closed* one by the time `markSaved` lands — it's been reopened.
`safeMarkSavedCount` exists purely to reconcile that race:

```ts
function safeMarkSavedCount(count: number): number {
  const segments = stateRef.current.segments;
  const reopened = segments[count - 1];
  const adjustedCount = reopened && reopened.durationMs === null ? count - 1 : count;
  const firstOpenIndex = segments.findIndex((s) => s.durationMs === null);
  const closedPrefixLen = firstOpenIndex === -1 ? segments.length : firstOpenIndex;
  return Math.min(adjustedCount, closedPrefixLen);
}
```

- If the segment at the boundary the flush is about to mark saved is now
  reopened (`durationMs === null`), back the count off by one — the server
  did save its *pre-undo* duration (the request already left with the old
  payload), but locally that segment is being re-timed, so it must not count
  as "safely saved" from the client's perspective.
- The final `Math.min(..., closedPrefixLen)` exists because **two** undos can
  land inside one in-flight flush — `segments[count - 1]` alone only catches
  one reopened segment; clamping to the actual closed prefix (`firstOpenIndex`)
  is what stays correct no matter how many undos raced the flush.

Accepted residue from this race: the server keeps the pre-undo duration for
that one segment (the insert already happened, and the unique index means a
retry of the corrected value would be silently ignored) — the local UI stays
internally consistent, but that one Hyrox station's saved time can end up
slightly stale if you undo it exactly while its save is mid-flight. Rare
enough, and self-correcting enough (the *next* real segment saves normally),
to accept rather than add reconciliation machinery for.

A second accepted gotcha, flagged directly in `handleExtraRound`'s code
comment:

```ts
function handleExtraRound(state: HyroxTimerState, atMs: number): HyroxTimerState {
  // Undo after extraRound leaves extraRounds incremented (accepted): endBlockEarly is the escape hatch.
  if (state.phase !== "blockDone") return state;
  // ...
}
```

`extraRound` ("+ Ekstra runda") increments `extraRounds[blockIndex]` *and*
opens a new `REST` segment in one step — but `undo` only ever reverses the
*segment* side of that (reopening the `REST` it just opened, per §8's table).
It does not, and cannot cleanly, decrement `extraRounds` back down — undo has
no "undo the extraRound decision" event, only "reopen the last closed
segment." So hitting undo right after tapping "+ Ekstra runda" leaves the
block still thinking it has one more round than the plan declared
(`effectiveRounds` stays bumped) even though the segment it opened is back to
being editable. `endBlockEarly` is the deliberate escape hatch here: it's the
only way to leave `rest` and land the block in `blockDone` without walking
through the extra round the machine now believes exists.

## 7. WebAudio sounds — unlock on the first gesture

`hyrox-sounds.ts` synthesizes tones with WebAudio instead of shipping audio
files — nothing for CSP to block, nothing to fetch offline, and no asset to
keep in sync with the countdown logic. The one browser quirk this has to
work around: iOS suspends a freshly created `AudioContext` until a user
gesture resumes it. `unlock()` is called synchronously inside the very first
`tap()`:

```ts
tap: () => {
  sounds.unlock();
  dispatch({ type: "tap", atMs: Date.now() });
},
```

`getContext()` lazily creates the `AudioContext` on whichever call happens
first (`unlock`, `warnBeep`, or `endBell`) — there's no context at all until
something actually needs one, so a session that's never gotten far enough to
hear a rest countdown never even instantiates WebAudio. Every method is
wrapped in try/catch and fails silently: a synthesized beep is a nice-to-have,
never something that's allowed to break the stopwatch.

The rest-countdown effect in `useHyroxLive.ts` fires sounds on *level
crossings*, not levels, so each cue fires exactly once per rest:

```ts
if (prev > 0 && remaining <= 0) {
  sounds.endBell();
} else if (restSeconds !== null && restSeconds >= 20 && prev > 15_000 && remaining <= 15_000) {
  sounds.warnBeep();
}
```

The 15-second warning is skipped entirely for rests declared shorter than 20
seconds — otherwise the warning and the end bell would overlap into noise a
second or two apart.

## 8. How to read `hyrox-timer.ts` — event → transition table

Suggested reading order: `HyroxTimerState`/`LiveSegment` shapes → `vnow` →
`closeTail`/`openSeg` helpers → `handleTap` (the actual FSM) →
`handleUndo`/`handlePauseToggle`/`handleEndBlockEarly`/`handleExtraRound` →
the `hyroxTimerReducer` dispatch table → `rehydrateFromSegments` → the
selectors at the bottom (`canUndo`, `runningMs`, `roundMs`/`roxMs`/`blockMs`,
`restRemainingMs`, `unsavedClosedSegments`). The mermaid diagram in the
file's header comment is the visual version of this table.

| Event (guard) | Transition | Who closes/opens a segment |
|---|---|---|
| `tap` in `idle` (plan/block/station must exist) | → `station` | opens `STATION` |
| `tap` in `station`, not last station | → `rox` | closes `STATION` tail, opens `ROX_ZONE` |
| `tap` in `station`, last station, `round < effectiveRounds` | → `rest` | closes `STATION` tail, opens `REST` (carries the round just closed — see §note below) |
| `tap` in `station`, last station, `round >= effectiveRounds` | → `blockDone` | closes `STATION` tail only, no new segment |
| `tap` in `rox` | → `station` (next `stationIndex`) | closes `ROX_ZONE` tail, opens next `STATION` |
| `tap` in `rest` | → `station` (`round + 1`, `stationIndex = 0`) | closes `REST` tail, opens `STATION` |
| `tap` in `blockDone`, another block exists | → `idle` (next block) | no segment op (the next `tap` opens the first station) |
| `tap` in `blockDone`, last block | → `done` | no segment op |
| `tap` in `done` | → `done` (no-op) | nothing |
| `undo` (`canUndo()`: last closed segment index ≥ `persistedCount` and in current block) | → `station`/`rox`/`rest`, matching the reopened segment's kind | reopens the most recently closed segment (`durationMs → null`); the *next* `tap` re-closes it |
| `pauseToggle` | no phase change | none — freezes/thaws `vnow` only |
| `endBlockEarly` (only from `rest`) | → `blockDone` | closes the open `REST` early |
| `extraRound` (only from `blockDone`) | → `rest` | opens a new `REST` for the current round; increments `extraRounds[blockIndex]` |
| `markSaved` | no phase change | none — only advances `persistedCount` |

**REST's `roundNumber` is the round it closes, not the one that follows.**
The rest after round 1 carries `roundNumber = 1`, even though the station
opened by the next tap starts round 2. Both `rehydrateFromSegments` (counting
completed stations per round) and `saveHyroxSegments`'s unique index rely on
this being consistent.

**The `persistedCount` boundary is the single source of truth for "what can
still change locally."** Everything at or after that index in `segments` is
either still running or hasn't been acknowledged by the server yet; anything
before it is off-limits to `undo` (§6) and excluded from the next flush's
payload (`unsavedClosedSegments`, §4).

## References

- [ADR-0023](../adr/ADR-0023-hyrox-training-data-model.md) — why `session_segments` is its own table, the `sets` mirror, and the Stage split.
- [`docs/architecture/data-model.md`](../architecture/data-model.md) — `session_segments` row in the wider schema.
- [`server-functions.md`](server-functions.md) — the `createServerFn`/Zod/multi-tenant-WHERE pattern `saveHyroxSegments` follows.
- [`upsert-and-composite-unique.md`](upsert-and-composite-unique.md) — the general shape of "composite unique index absorbs retries" this reuses for segment flush idempotency.
