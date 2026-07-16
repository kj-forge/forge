# ADR-0020: Per-user exercise catalogue (copy-on-provision)

- **Status:** Proposed
- **Date:** 2026-07-16
- **Deciders:** @kj-ninja
- **Linear:** [FRG-18](https://linear.app/kj-forge/issue/FRG-18)

## Context

The `exercises` table is a global, app-owned, read-only reference catalogue (~33 rows seeded once). ADR-0012 explicitly classifies it as a *non-owned* table that "does not carry `athlete_id`", and the app has no write path to it — only `db/seed.ts` inserts rows.

The product has outgrown this: athletes need to add their own exercises (belt squat, a rehab variant, a machine the gym happens to have) and edit the ones they use (rename, change the unit, mark a lift as "main" for their PR table). With a shared catalogue, one athlete's edit would leak into every other athlete's history and stats — unacceptable in a multi-tenant app.

A second, quieter problem: product behaviour hangs off **hardcoded slugs** (`ACCESSORY_SLUGS`, `PR_TABLE_SLUG_ORDER`, `LOADED_BW_SLUGS` in `strength/constants.ts`) and a global `is_main_lift` flag. These assume every athlete's catalogue is spelled identically forever — which per-user editing breaks by definition, so the decision must also cover where those behaviours move.

Constraints: two real users exist (both on the Neon `main` branch), so the data migration is trivial today and only gets harder; `block_movements.exercise_id` (RESTRICT), `training_plan_day_exercises.exercise_id` (RESTRICT) and `goals.exercise_id` (SET NULL) are the only FKs into the catalogue; solo-dev velocity favours the simplest queries at runtime.

## Decision

Exercises become **athlete-owned rows provisioned by copy**. The table gains `athlete_id` (nullable), `source_exercise_id`, and `is_loaded_bodyweight`. Rows with `athlete_id IS NULL` are the **global starter templates** (maintained by seed, never shown in the app); on signup, every template is copied to the new athlete (`source_exercise_id` pointing back). All app reads and writes are scoped to `athlete_id = me`; editing and adding are plain row operations on rows the athlete owns. Existing athletes are migrated once: copy templates to owned rows, then repoint their `block_movements.exercise_id` and `goals.exercise_id` to the copies. Product behaviours move off hardcoded slugs onto per-row flags: `is_main_lift` (already present, now user-editable) and the new `is_loaded_bodyweight`; PR-table ordering falls back to category + name.

## Alternatives considered

### Alternative A — Global base + per-athlete overlay

Keep the shared catalogue; store only additions and overrides per athlete, resolve `global ∪ mine − overridden` at read time.

- Pros: no data migration; no row duplication; template fixes reach everyone instantly.
- Cons: every read becomes a union with override-shadowing (permanent runtime complexity in search, pickers, stats); FKs may point at either layer, so "whose row is this?" haunts every join; editing a global row still needs a copy-on-write step — the overlay converges on the copy model with extra moving parts.

### Alternative B — Free-for-all shared catalogue (any user can edit/add globally)

- Pros: zero schema work; additions benefit everyone.
- Cons: one athlete renaming "Martwy ciąg" rewrites another athlete's history and PR table; no ownership boundary means no safe delete; abusive or accidental edits are unbounded. A non-starter for anything multi-tenant.

### Alternative C — Copy-on-provision (chosen)

- Pros: queries stay one-predicate simple (`athlete_id = me`, matching ADR-0010's owned-row invariant); edits and custom rows are ordinary writes with ordinary ownership checks; per-row flags naturally replace hardcoded slugs.
- Cons: ~33 rows duplicated per athlete (storage-trivial); template improvements don't propagate to existing athletes (acceptable — their catalogue is *theirs*); a one-time repoint migration for existing data.

## Consequences

### Positive

- Athletes can add and edit exercises without affecting anyone else; the catalogue becomes a personal tool, not shared infrastructure.
- Runtime model matches every other owned table (ADR-0010): no special-case joins, no layer resolution.
- PR table / dashboard trend / e1RM suppression are driven by per-row flags the user can control, instead of code constants that silently break on rename.

### Negative / trade-offs

- Partially reverses ADR-0012 for `exercises`: the table now carries `athlete_id` (templates keep `NULL`). ADR-0012's rule still holds for `hyrox_stations`, `progression_rules`, `rehab_protocols`.
- Slug uniqueness weakens from global to per-scope (partial unique indexes: templates by `slug`, owned rows by `(athlete_id, slug)`); slugs are no longer globally authoritative identifiers — `id` is.
- Deleting an exercise that has logged history stays blocked by the `block_movements` RESTRICT FK; UX must offer archive/hide instead of hard delete.

### Follow-ups

- Migration `0010`: columns + partial unique indexes + copy-and-repoint for existing athletes (templates stay as seed material).
- Signup hook (`runSignupTransaction`) provisions the copy for every new athlete.
- Retire `ACCESSORY_SLUGS` / `PR_TABLE_SLUG_ORDER` / `LOADED_BW_SLUGS`; scope `searchExercises` / `listAllExercises` / `getRecentExercises` to the athlete.
- "Ćwiczenia" management screen + inline create in the exercise picker (unblocks the FRG-17 deferred sub-feature).
- Future (out of scope): sharing custom exercises between athletes; propagating template improvements as opt-in suggestions.

## References

- ADR-0010 — multi-tenant schema (owned rows carry `athlete_id`).
- ADR-0012 — Drizzle conventions (the "catalogs don't carry athlete_id" rule this ADR partially reverses).
- Roadmap exploration (FRG-16/17/18 planning): coupling points — 2 FKs into `exercises`, no in-app write path, hardcoded slug consumers in `strength/server/queries.ts`, `dashboard/server/dashboard.ts`, `strength/views/StatsView.tsx`, `ExerciseDrawer.tsx`.
