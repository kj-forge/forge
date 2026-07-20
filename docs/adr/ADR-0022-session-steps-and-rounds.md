# ADR-0022: Session steps & rounds — circuit logging on multi-block sessions

- **Status:** Proposed
- **Date:** 2026-07-20
- **Deciders:** @kj-ninja
- **Linear:** [FRG-20](https://linear.app/kj-forge/issue/FRG-20)

## Context

Two testers reported that logging supersets (squat + pull-up alternated lap by lap) forces ping-ponging the exercise arrows, because navigation followed the flat exercise list rather than the workout's chronology. ADR-0016 modeled every strength session as a single `STRAIGHT_SETS` block and explicitly deferred richer layouts. The block model from ADR-0009 (`sessions → session_blocks → block_movements → sets`) was designed for exactly this — `kind`, `targetRounds`, `restSeconds`, `notes` existed on blocks since migration 0000, unused.

## Decision

A strength session becomes an ordered list of STEPS, one `session_blocks` row each. A step's SHAPE drives the UI: one movement renders the classic single-exercise logging view unchanged; two-plus movements render a circuit ("obwód") view — all exercises of a lap at once, one atomic `saveRound` write per lap, lap counter with an optional target ("Obwód 2/4"); `kind=REST` renders an informational break page (no timer — self-paced per ADR-0016). There is deliberately **no SUPERSET/CIRCUIT enum value**: shape is derived from the movement count, so attaching an exercise to a step mid-workout can never desync from a flag. A lap = `sets.setNumber` aligned across the block's movements; the current lap is the workout's **frontier** (highest logged lap until every movement has it), so an exercise added mid-step joins the lap in progress instead of backfilling from lap one. Lap kind (Rozgrzewka/Top set/Back-off) is chosen once per lap and stamps every set in it; warm-up laps are excluded from PR checks. Plan units gain the same structure (`training_plan_unit_steps` + `_step_exercises`, reusing `blockKind` restricted to `STRAIGHT_SETS|REST` in zod), materialized 1:1 into blocks on session start; "repeat from last session" clones the block structure. Legacy single-block sessions were split by data migration 0015 into one block per movement (sets follow their movements untouched), so every historical session renders as classic steps.

## Alternatives considered

### Alternative A — separate "Obwodowa" session type

- Pros: classic strength flow untouched; a dedicated, coherent circuit world.
- Cons: the workout's character must be chosen upfront; mixed workouts (strength pairs + timed core — the requester's own training) can't exist in one session; supersets inside a "Siłowa" session keep the ping-pong; multiplies session types, which the product explicitly wants to avoid.

### Alternative B — smart "next" without structure (recency heuristic)

- Pros: zero schema/UI change — arrows jump to the least-recently-logged exercise.
- Cons: magic ordering that's unpredictable at unusual pacing, unexplainable in UI, and gives no lap counter, lap notes, or round targets.

### Alternative C — render-time fallback instead of splitting legacy blocks

- Pros: no irreversible data migration.
- Cons: every future consumer of `getSessionDetails` carries the fallback forever; at migration time every multi-movement `STRAIGHT_SETS` block is unambiguously legacy, so a one-time split (block id := movement id; `attachExercises` re-ordered by block orderIndex) is precise and cheap.

## Consequences

### Positive

- "Always next": step navigation is chronological and non-looping; a lap is one tap ("Zapisz obwód") or per-exercise ✓s.
- Classic logging survives 1:1 (kind chips, ± steppers, history seeds, PR toasts) for single-exercise steps.
- Stats, PR and history pipelines are untouched — they join through movements and never counted blocks.
- Plan units express real workout structure (circuits with targets, rest breaks) and seed sessions with it.

### Negative / trade-offs

- An exercise added to a circuit mid-workout has empty cells for earlier laps ("—" in summaries) — accepted, it reflects reality.
- Lap kind is per-lap, not per-exercise-per-lap; mixed-kind laps are not expressible (acceptable: warm-up laps are whole-circuit warm-ups).
- Editing a logged lap in place was deferred — the flow is delete lap ✕ + re-log (follow-up candidate).
- Migration 0015's block split is irreversible and must deploy together with the code (old code reads only `blocks[0]`).

### Follow-ups

- In-place lap editing (tap a summary row) if delete-and-relog proves annoying.
- Step reordering in the active session (unit editor has it; sessions append-only for now).
- Hyrox EMOM/AMRAP session layouts reuse the same multi-block rendering with their reserved block kinds.

## References

- ADR-0009 — block data model this activates; ADR-0016 — single-block statement this supersedes (its §"Session lifecycle" one-block-per-session invariant no longer holds); ADR-0021 — unit exercise list replaced by unit steps.
- Migration `db/migrations/0015_calm_green_goblin.sql` — unit steps tables + legacy block split.
- `src/features/strength/lib/step-progress.ts` — frontier-lap arithmetic (unit-tested).
