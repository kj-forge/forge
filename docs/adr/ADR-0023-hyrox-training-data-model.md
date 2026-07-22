# ADR-0023: Hyrox training data model — segment timeline, repeated stations, type-driven view

- **Status:** Proposed
- **Date:** 2026-07-22
- **Deciders:** @kj-ninja
- **Linear:** [FRG-21](https://linear.app/kj-forge/issue/FRG-21)

## Context

Hyrox training is a coach-operated stopwatch flow: a block is a fixed sequence of stations (e.g. Ski Erg, Sled Push, Run) repeated for N rounds, separated by a rox zone (roughly the run between stations) and, after the last station of a round, a declared rest before the next round starts. The design spec (`docs/superpowers/specs/2026-07-22-hyrox-training-design.md`) splits delivery into three stages: **Stage 1** — declare Hyrox blocks/stations with targets in the plan unit editor and materialize them into a session on start; **Stage 2** — a live stopwatch view (`HyroxSessionView`) that logs every station/rox-zone/rest segment as it happens; **Stage 3** — a stats page with race-time estimation, out of scope here. This ADR is written during Stage 1 but records the data-model decisions for both Stage 1 (shipped in this PR) and Stage 2 (announced, not yet built), because both hang off the same schema choice and splitting them across two ADRs would separate a decision from half its rationale.

Two schema questions came up that ADR-0009's block model (`sessions → session_blocks → block_movements → sets`) doesn't answer by itself:

1. **Where does the live segment timeline live?** Stage 2 needs to record every station/rox-zone/rest interval with its actual duration, support "undo" (drop the most recent unsaved segment), survive tab kills (rehydrate from a local journal), and flush idempotently in batches — none of which map cleanly onto `sets`, which is shaped as "one row per logged exercise set," not "one row per timeline event."
2. **Can a station repeat inside one Hyrox sequence?** A Hyrox block can run "500 m Run" twice in the same round (once mid-sequence, once as the rox zone equivalent between other stations). `block_movements` and `training_plan_unit_step_exercises` both carried a unique index on `(block/step, exercise)` — added as a double-add guard, not a domain rule — which makes this unrepresentable.
3. **How does the UI decide it's rendering a Hyrox session?** ADR-0022 established that block *shape* (movement count), not a flag, drives which view a strength step renders. Hyrox needs its own live-timer view regardless of shape, which is a genuine exception to that rule.

## Decision

**Segment timeline (Stage 2, announced here):** a new table `session_segments` is the first-class timeline for Hyrox live logging — one row per station/rox-zone/rest interval, `kind` (`STATION | ROX_ZONE | REST`) as a new pg enum, `roundNumber` + `orderIndex` for position, `durationMs` (millisecond precision, since live rounds run in single-digit minutes and tenths matter on screen), and a unique index on `(blockId, roundNumber, orderIndex)` so retried flushes are `onConflictDoNothing`-idempotent. Every `STATION` segment additionally writes a mirror row into `sets` (`setNumber = roundNumber`, `durationSeconds = round(durationMs / 1000)`, `kind = WORK`) in the same transaction, so exercise history/PR pipelines keep working unmodified for Hyrox stations — `session_segments` stays the timeline's source of truth; `sets` is a read-shaped projection of it, not the other way round.

**Repeated stations (Stage 1, shipped):** the unique indexes `block_movements_block_exercise_uq` (`blockId, exerciseId`) and `training_plan_unit_step_exercises_step_exercise_uq` (`stepId, exerciseId`) are dropped. Both existed only as a server-side guard against a double-add race (slow network / double-tap on "add exercise"), not a schema invariant — Hyrox needs the same exercise to appear twice in one round's sequence. The guard moves into application code (`addExerciseToStep` now does a `select` + explicit check before insert); the accepted trade-off is a removable duplicate row on a genuine double-tap race, not data corruption.

**Optional targets:** `block_movements.targetReps` and `training_plan_unit_step_exercises.{targetReps, targetDistanceM}` are new nullable integer columns — a declared station target (reps or meters, chosen by the exercise's `defaultUnit`; `TIME`/`CALORIES` stations have no target field in v1). `training_plan_unit_steps.restSeconds` is the declared rest between rounds at the plan-unit level (the `session_blocks.restSeconds` column this materializes into already existed, unused, since ADR-0022/migration 0000).

**View branch by session type:** `ActiveSessionView`/`NewSessionView` branch on `session.type === "HYROX"` for heading text and empty-state copy in Stage 1, and the eventual `sessionId.tsx` route will pick `HyroxSessionView` over the classic step view the same way in Stage 2. This is the first place in the app that branches a view on session *type* rather than block *shape* — a deliberate, narrow exception to ADR-0022's rule. It's justified because Hyrox's live-timer interaction (big clock, tap-to-advance, rox-zone tint, wake lock) isn't a rendering of `session_blocks`/`block_movements` at all; it's a different interaction model that happens to write into the same block/movement/set tables afterward. The stored shape stays universal per ADR-0022 — `blockKind` for Hyrox blocks is still plain `STRAIGHT_SETS` — only the live-session screen, not the data, is type-gated.

## Alternatives considered

### Alternative A — jsonb column on `session_blocks` for the segment timeline

Store the round-by-round segment log as a jsonb array on the block (`session_blocks.segments: jsonb`) instead of a dedicated table.

- Pros: zero new tables/enum, cheapest to ship, trivial to append to during a live session.
- Cons: unqueryable for Stage 3 (race-time estimation needs to aggregate segment durations by station across many sessions — a jsonb blob per block means scanning and parsing every block instead of an indexed `WHERE kind = 'STATION'` query); no per-row uniqueness constraint, so the idempotent-flush guarantee (`onConflictDoNothing` on retry) would have to be reimplemented as read-modify-write JSON merging, which is exactly the kind of race the "double flush" error-handling section of the spec exists to avoid; a growing jsonb column being rewritten on every tap is also a larger row lock than an insert-only child table.

### Alternative B — extend `sets` with a jsonb timeline column instead of a new table

Keep the timeline inside `sets` — add a jsonb `segment_meta` column and let rox-zone/rest segments live as `sets` rows too, tagging their kind in jsonb.

- Pros: one fewer table; history/PR queries already join through `sets`, so no mirror-write step.
- Cons: `sets.blockMovementId` is `NOT NULL` and every existing consumer assumes a `sets` row is "one logged set of one exercise" — rox-zone and rest segments have no movement to attach to, forcing either a nullable FK (breaking that invariant for every other reader of `sets`) or a dummy placeholder movement (which then shows up in exercise history/stats and has to be filtered out everywhere). It conflates two different entities — "a logged working set" and "a timeline tick" — under one row shape and one jsonb catch-all, the same anti-pattern ADR-0009 already rejected for the block model in general.

## Consequences

### Positive

- The segment timeline (Stage 2) is queryable and idempotent from day one — no jsonb parsing, no read-modify-write races on flush retries.
- Exercise history and PR pipelines need zero Hyrox-specific code — the `sets` mirror means a Hyrox station is, from their point of view, just another logged set.
- A Hyrox sequence can express its real structure (a repeated run between other stations) instead of forcing an artificial second exercise or dummy row to work around a uniqueness constraint that was never a domain rule.
- The type-based view branch is narrow and explicit (one `session.type === "HYROX"` check at the route/view boundary) rather than leaking into the block/movement schema — `blockKind` stays universal, so Stage 3 stats and any future non-Hyrox multi-round block kind still read through the same tables.

### Negative / trade-offs

- Two tables now carry overlapping information for a Hyrox station's duration (`session_segments.durationMs` and its `sets` mirror row) — accepted because they serve different readers (live timeline vs. exercise history) and the mirror write is transactional, so they can't drift.
- The double-add guard for repeated exercises moved from a database constraint to an application check — a genuine race (two rapid double-taps) can still produce a removable duplicate row; accepted since the failure mode is a visible, deletable duplicate, not silent corruption.
- `session.type === "HYROX"` is now a second axis views can branch on, alongside block shape — a future contributor adding a session type must remember both axes exist; scoped to the two Stage 1 sites plus the Stage 2 session route, not scattered further.

### Follow-ups

- Stage 2 implementation: `session_segments` table + `segment_kind` enum + migration, `saveHyroxSegments` server fn (transactional insert + `sets` mirror, `onConflictDoNothing` on the unique index), the `hyrox-timer.ts` reducer, `HyroxSessionView`, and `docs/learning/hyrox-live-timing.md` (wake lock, time anchors vs. rAF throttling, idempotent flush, localStorage journal) — separate plan, separate PR, per the spec's stage split.
- Stage 3 (separate spec/brainstorm): race-time estimation reads `session_segments` aggregated by station; a manual-target fallback for athletes missing station data.

## References

- Design spec: `docs/superpowers/specs/2026-07-22-hyrox-training-design.md`
- Implementation plan: `docs/superpowers/plans/2026-07-22-hyrox-plan-declaration.md`
- ADR-0009 — block model (`sessions → session_blocks → block_movements → sets`) this extends
- ADR-0016 — single-block session statement (session lifecycle context)
- ADR-0021 — training plans as unit libraries (plan unit steps this ADR adds columns to)
- ADR-0022 — session steps & rounds; shape-driven view rule this ADR narrowly exempts Hyrox from
- Migration `db/migrations/0016_panoramic_hobgoblin.sql` — target/rest columns, dropped unique indexes
