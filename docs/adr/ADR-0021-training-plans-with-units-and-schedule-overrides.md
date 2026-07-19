# ADR-0021: Training plans as unit libraries with weekday activation and per-date schedule overrides

- **Status:** Proposed
- **Date:** 2026-07-19
- **Deciders:** @kj-ninja
- **Linear:** [FRG-19](https://linear.app/kj-forge/issue/FRG-19)

## Context

The original plan model (`training_plan_days`, one row per weekday, unique per athlete) hardwired a single Mon–Sun plan. User feedback (beginner / less consistent athletes) demands: several concurrent plans ("Hardy Method" strength 2×/week + a running base plan 3×/week), pausing a plan during injury and re-activating it months later without retyping, and a week view where a workout can be moved to another day or added ad hoc without mutating the weekly pattern. ADR-0016 explicitly deferred a `training_plans` entity to P1 — this is that work. Constraints: single-athlete UX today but coach→athlete sharing plausible later; Workers + HTTP driver (transactions only via the WebSocket pool); production carries real data that must migrate in place.

## Decision

Split *content* from *scheduling* across three layers. (1) `training_plans` — a named, reusable entity with lifecycle `DRAFT → ACTIVE ⇄ PAUSED → COMPLETED` and the activation window (`startDate`, optional `endDate`) stored directly on the plan. (2) `training_plan_units` — ordered workouts within a plan (name, sessionType, intensity HARD/MEDIUM/EASY, free text, goal, optional ordered exercise list) with **no weekday baked in**; weekdays are chosen at activation into `training_plan_unit_days` and replaced wholesale on each (re-)activation, surviving pauses for prefill. (3) `schedule_overrides` — per-date exceptions (`SKIP` / `ADD` / `ADHOC`) so drag-and-drop moves affect only the given week; a drag is a SKIP+ADD pair, quick out-of-plan entries are ADHOC rows. The rendered week is a pure merge (`resolveWeek`): weekday pattern of ACTIVE, non-expired plans − SKIPs + ADDs + ADHOCs. RESET intensity is dropped — rest is simply an unassigned day. Multiple plans and multiple units per day are allowed with no collision validation.

## Alternatives considered

### Alternative A — plan defines its own weekdays (activation = on/off toggle)

- Pros: simpler activation UX (one switch); no assignment table.
- Cons: plans stop being reusable — returning to a plan after months forces editing its content; two plans wanting the same weekday require editing one of them; content and schedule stay coupled, which is the exact flaw of the old model.

### Alternative B — separate `plan_activations` history table

- Pros: keeps a record of every past run of a plan (dates, day picks); cleaner "current activation" semantics.
- Cons: history of activations is not a requirement; every schedule/dashboard read pays an extra join; two sources of truth for "is this plan active".

### Alternative C — materialized calendar (generate dated workout rows for future weeks)

- Pros: per-date edits become trivial row updates; calendar views are cheap reads.
- Cons: unbounded row generation with horizon/regeneration problems whenever the pattern changes; pausing/re-activating means bulk rewrites; overkill while the product deliberately avoids a full calendar (weekday pattern + exceptions covers the observed use cases).

## Consequences

### Positive

- Plans are durable assets: pause during injury, re-activate later with new days, run several at once — no retyping.
- Weekly pattern stays clean: a dragged workout or ad-hoc addition is a dated exception; next week returns to the plan.
- "Today" everywhere (dashboard CTA, new-session default) derives from the resolved schedule, so moved workouts behave correctly.
- Sessions never reference plans (seed-only via `fromUnitId`), so deleting plans can't touch history.

### Negative / trade-offs

- No activation history — re-activating overwrites the previous window and day picks.
- Stale `SKIP` rows for dates in the past accumulate (harmless, date-bound; can be pruned later).
- An `ADD` of a unit already scheduled that day renders the unit twice (deliberate: two-a-days exist; no collision validation anywhere).
- Editing a unit of an ACTIVE plan applies immediately — no versioning of plan content.

### Follow-ups

- Copy-unit-between-plans action if cross-plan reuse demand shows up (rejected for now: shared-reference editing is a footgun).
- Periodization (cycles) intentionally out of scope — a "cycle" is just another plan.
- Coach→athlete plan sharing builds on plan reusability when the multi-tenant story lands.
- Prune job (or migration) for expired `schedule_overrides` if the table ever matters for read performance.

## References

- ADR-0009 — session/block data model the seeding targets.
- ADR-0016 — strength logging UX; deferred the `training_plans` entity this ADR delivers.
- Migration `db/migrations/0014_icy_mole_man.sql` — in-place fold of `training_plan_days` into one ACTIVE "Plan tygodnia" per athlete; drops `weekly_templates`.
- `src/features/plan/lib/schedule.ts` (`resolveWeek`) — the pure merge the whole feature hangs off.
