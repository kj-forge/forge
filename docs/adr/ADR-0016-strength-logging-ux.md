# ADR-0016: Strength session logging — UX, schema, server-fn architecture

- **Status:** Accepted
- **Date:** 2026-06-09
- **Deciders:** @kj-ninja
- **Linear:** [FRG-9](https://linear.app/kj-forge/issue/FRG-9)

## Context

First user-facing domain feature after auth. Goal: an athlete can log a strength session on mobile — including modern top-set + back-off schemes — in under 5 minutes of UI time, end-to-end. Real-world reference: user's typical session is `Siady 110kg 5/5/5/5 / Drążek 12/12/11 / OHP 45kg 12/10/9/7 / RDL 80kg 8/8/8/8` with conclusions in free-form notes at the end.

Key constraints in scope:
- Mobile-first PWA, no native gestures yet.
- TanStack Start file routing + server functions; Drizzle on Neon Postgres.
- Schema from data-model epic already has `sessions → session_blocks → block_movements → sets`. Sets had `is_warmup: boolean`, which is insufficient for top-set / back-off / failure distinction.
- Tests are deferred to a sub-issue (per the strategy used in the auth epic) — but the code must be structured so they can be written.
- No plans / templates entity yet (P1 feature). MVP is ad-hoc + "from last session" template flow.

## Decision

### Schema additions (migrations 0002 + 0003)

1. New `set_kind` enum: `WARMUP | TOP_SET | WORK | BACK_OFF | FAILURE | DROP_SET`.
2. New `kind` column on `sets`, `NOT NULL DEFAULT 'WORK'`.
3. Drop the now-redundant `is_warmup` boolean (table was empty in dev so the drop is data-safe; the migration is split into two — add column first, drop column second — because `drizzle-kit generate` needs an interactive prompt to disambiguate "is this a rename?" otherwise, and Bun's subprocess has no TTY).

### Session lifecycle

- `STRENGTH` sessions are modeled as `sessions ← session_blocks (one row, kind=STRAIGHT_SETS) ← block_movements (N rows, one per exercise) ← sets`.
- The single-block grouping is wasted weight for pure strength but matches the existing model for Hyrox / interval sessions, and adding sport-specific session shapes would inflate the schema for marginal gain.

### Atomicity

- `createSession({type, date, fromTemplateSessionId?})` writes `sessions` + `session_blocks` (+ `block_movements` if cloning a template) inside one `dbPool.transaction(...)`. Same atomic pattern established for the auth signup hook — partial state is impossible.
- Single-statement mutations (`addSet`, `addExerciseToSession`, `endSession`, `updateSessionNotes`, `deleteSet`, `deleteSession`, `removeExerciseFromSession`) go through the HTTP `db` client — cheaper, Workers-friendly.

### Template matching

"Z poprzedniej sesji" looks up the most recent session of the same `type` AND same day-of-week (Postgres `EXTRACT(DOW FROM date) = ?`). Falls back to the most recent session of the same type if no day-of-week match exists. Reason: real athlete routines repeat weekly (Tuesday = strength A, Thursday = strength B), so a Thursday session should not pre-populate from last Tuesday's lifts.

### Set kind auto-detection

When the user opens an exercise drawer and hasn't already labelled the set kind manually:
- If no sets are logged yet for that movement → `WORK`.
- If the previous logged set was a `TOP_SET` and the new weight is lower → `BACK_OFF`.
- Otherwise → mirror the kind of the previous set (carry-over).

Auto-detection is a suggestion, not a constraint — a chip selector is always present so the user overrides in one tap. The heuristic is intentionally simple; richer rules (recognising ramp-up patterns automatically) are explicit follow-up work, not implicit in this epic.

### Progression suggestion (RPE-based, deterministic)

`suggestProgression(exerciseId)` examines the last completed (`endedAt IS NOT NULL`) session that contains this exercise, looks at the non-warmup sets:
- If max RPE across all sets is ≤ 8 and the last set has a weight → suggest `+2.5 kg`.
- If max RPE ≤ 8 and the last set is bodyweight → suggest `+1 rep`.
- Otherwise → "utrzymaj obecny ciężar".
- If no RPE data → "brak danych, zaloguj RPE".

This is a P0 deterministic helper. AI-driven progression (taking sleep, HRV, recent injuries into account) is an explicit P1 follow-up.

### Server function architecture

- Every strength server fn calls `getCurrentAthleteOrThrow()` first — explicit per-fn auth check (no middleware in TanStack Start). Verifies the cookie, finds the athlete row for the user, throws if either step fails.
- Multi-tenant ownership invariant ([ADR-0010](ADR-0010-multi-tenant-schema.md)) is enforced inside every `WHERE` and `RETURNING` clause: `eq(table.athleteId, currentAthleteId)`. A stale or malicious client cannot read/write another athlete's data.
- All inputs go through Zod (`inputValidator`); no untrusted data ever reaches Drizzle/Postgres without explicit validation.

### Server / client bundle boundary

- Server-only code (`db/pool.ts`, `db/client.ts`, anything using `dbPool` / `auth.api` at top level) must NOT leak into the client bundle. TanStack Start strips `createServerFn` handler closures from client output, but **only if non-server-fn references are also kept out of exported scope**.
- Concrete rule: do not `export` plain async functions that touch server-only modules. Helpers stay module-internal (closure-scoped) and are called only from inside server-fn handlers.
- This rule is non-obvious — we shipped a bug where `runCreateSession` was exported, dragged `dbPool` into the browser bundle, and crashed with `DATABASE_URL is not set`. The fix was to make it module-internal. See `docs/learning/server-functions.md` for the post-mortem.

### Read-after-write race mitigation

The Neon HTTP driver and the WebSocket-pool driver are different connection paths. A row just committed via `dbPool.transaction(...)` can briefly be invisible to the next `db` (HTTP) read on a different pooled replica. `getSessionDetails` retries the lookup up to 3 times with 120 ms backoff before declaring "Session not found". Documented so we don't accidentally rip it out.

### Set kind colour palette

| Kind | Icon | Light | Dark | Reason |
|---|---|---|---|---|
| WARMUP | 🔥 | `text-muted-foreground` | same | "Not the real work" — faded, secondary |
| TOP_SET | ⭐ | `text-orange-600` | `text-orange-400` | Heat, attention — max effort |
| WORK | • | `text-foreground` | same | Baseline / neutral |
| BACK_OFF | 💪 | `text-emerald-600` | `text-emerald-400` | Volume work, success-feeling green |
| FAILURE | ⚠️ | `text-red-600` | `text-red-400` | Caution — incomplete set |
| DROP_SET | ↘ | `text-purple-600` | `text-purple-400` | Distinct category, distinct hue |

Icons paired with colour for accessibility (colour-blindness). Palette is not load-bearing — refinement is welcome once the user has logged real sessions in mixed lighting.

### Delete semantics

- **Delete set** (per row in the exercise drawer): one HTTP DELETE; UI re-fetches. No confirm — wrong sets are common, undo via redo-add is one tap. Ownership check on server.
- **Delete pending exercise** (a `block_movement` with zero sets): ✕ button on the movement card, hidden once any set is logged. Server-side guard re-checks `COUNT(sets) = 0` so a stale client can't accidentally delete an exercise with data.
- **Delete session**: confirm drawer regardless of session state. Warns differently for "in progress" vs "ended". Cascade drops all session_blocks → block_movements → sets via FK.

### UI patterns settled in this PR (precedents for future epics)

- **`createFileRoute().beforeLoad`** for protected routes — explicit `getSession()` + `throw redirect({to: "/login"})`. No middleware abstraction yet.
- **`loader`** for read fns, `router.invalidate()` after each mutation — no React Query yet; the loader-invalidate cycle is sufficient for one-user single-tab UX.
- **Vaul drawer** wrapped by shadcn `Drawer` for bottom-sheet UX.
- **Conditional child component** (`{open && <Form />}`) for drawers whose form state should reset on each open — preferred over `useEffect`-based reset (anti-pattern).
- **String state for numeric inputs** — backspace must produce empty input, not snap-back to "0". Parse on submit / stepper actions.
- **Global pending component** via `defaultPendingComponent` on the router; `defaultPendingMs: 300, defaultPendingMinMs: 300` to avoid flicker.
- **Reusable `<Spinner size="sm" | "md" />`** for both global loader and inline button states.

## Alternatives considered

### Alternative A — Single boolean / flag column instead of a `set_kind` enum

- Pros: smaller surface, no migration.
- Cons: can't represent 6+ states; `is_warmup` was already proving insufficient (top-set, back-off, failure all need labels). Boolean-soup ages badly.

### Alternative B — Plans / templates entity now (`training_plans` table)

- Pros: "what's on the bar today" comes from the plan, deterministic.
- Cons: 2+ weeks of additional work to design and ship plan creation UI; "from last session" matches 90% of routine repetition without it. Defer to P1.

### Alternative C — React Query for cache + optimistic updates

- Pros: smoother UX (optimistic add-set), better cache invalidation control.
- Cons: extra dep, more moving parts; the TanStack Router `loader` + `router.invalidate()` pattern is sufficient until we have multi-tab or coach views. Adopt later when the pain shows up.

### Alternative D — Rest timer integrated in the exercise drawer

- Pros: standard gym-app feature.
- Cons: user trains "dual-bout" (squat → pull-up → accessory all as one round) with self-paced rest; a timer per individual set actively gets in the way. Defer to "only if asked".

### Alternative E — Re-export `runCreateSession` for testability (as we did with `runSignupTransaction` in FRG-7)

- Pros: extractable for unit tests without going through the server-fn lifecycle.
- Cons: caused the server/client bundle leak — see "server / client bundle boundary" above. Tests can either go through the public `createSession` server fn or use a `serverOnly` wrapper when we add the integration test suite. Re-architect at that point.

## Consequences

### Positive

- Logging a typical 4-exercise strength session takes under 60 seconds (no plan, no AI, just defaults from last session + tap-to-confirm).
- Top-set + back-off schemes render meaningfully — coloured chips show the structure at a glance, not just numbers.
- Hyrox / cardio / rehab epics can reuse the same `sessions → blocks → movements → sets` shape; UI patterns (drawer + steppers + kind chips) generalise.
- Server-fn architecture is consistent with the auth epic — every fn has the same auth-then-validate-then-act shape.
- Multi-tenant invariant is enforced at the query level — no `eq(athletes.id, …)` missed in `WHERE` clauses.

### Negative / trade-offs

- Single block per strength session feels redundant when reading the schema (`session_blocks` is decorative for STRAIGHT_SETS sessions). Acceptable cost for sharing one shape with EMOM / AMRAP / WORK sessions.
- Per-fn `getCurrentAthleteOrThrow()` adds ~2 DB queries per server-fn call (~100 ms on Neon HTTP). Acceptable for Phase 1; revisit with a session-cookie-backed athleteId cache if hot-path latency shows up.
- OAuth token plaintext + PII retention concerns from ADR-0015 are unchanged — still folded into the observability epic.
- No history filters (date range, exercise) in `/sessions` yet — simple chronological list. Filters come with the analytics epic.
- Read-after-write retry adds up to 240 ms latency to the first `getSessionDetails` after `createSession`. The global pending component covers this with a loader from 300 ms; in practice the first attempt succeeds 95% of the time on Neon.

### Follow-ups

- **Integration tests** for the atomic `runCreateSession` transaction, RPE-based progression heuristic, delete-pending guard. Goes into the FRG-7 testing sub-issue alongside the auth tests — same Testcontainers stack.
- **Plans / templates entity** — `training_plans` + UI to create / apply / track. Phase 2 / P1.
- **Edit set** (not just delete) — Phase 2 follow-up; pattern: tap a set row in the summary, drawer with the same form pre-filled.
- **Save session as template** — Phase 2; converts a finished session into a reusable plan day.
- **Auto-progression with AI** — uses RPE + sleep + HRV inputs once daily wellness epic lands.
- **Rest timer** — re-evaluate once the user asks for it, or when a Hyrox EMOM epic ships (timing-critical there).
- **Volume / 1RM analytics** — separate analytics epic.
- **Edit history / undo** — if real user testing shows accidental deletes are a pain.

## References

- [ADR-0009](ADR-0009-hyrox-data-model-rehab-tracking.md) — `sessions → blocks → movements → sets` data model (this epic uses it for STRENGTH)
- [ADR-0010](ADR-0010-multi-tenant-schema.md) — athleteId denormalisation enforced everywhere in `where` clauses
- [ADR-0012](ADR-0012-drizzle-conventions.md) — schema conventions used for the `set_kind` enum and column
- [ADR-0015](ADR-0015-better-auth-implementation.md) — atomic transaction pattern (`dbPool.transaction(...)`) and `getCurrentAthlete` helper precedent
- `docs/learning/strength-ux.md` — UX flow walkthrough + set kind reference
- `docs/learning/server-functions.md` — server-fn patterns + bundle boundary post-mortem
