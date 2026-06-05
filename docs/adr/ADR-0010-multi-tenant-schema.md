# ADR-0010: Multi-tenant schema from day 1 (single-user UI in P0)

- **Status:** Accepted
- **Date:** 2026-05-16
- **Deciders:** @kj-ninja

## Context

The original plan assumed Forge was a single-user app. The post-audit conversation revealed the user wants athlete↔coach linking and a minimal "other athletes" view (username, training count, strength PRs, running PRs) — not in P0, but P1/P2.

Two ways to get there:

1. Build single-user schema (`user_id` everywhere), migrate to multi-tenant when coach features land.
2. Build multi-tenant schema from day 1 (`athlete_id` on every owned row), restrict the UI to single-user in P0.

## Decision

**Option 2.** Schema is multi-tenant from the first migration. UI is single-user in P0.

Concretely:

- `users` is the auth principal (Better Auth handles).
- `athletes` is the tenant unit. 1:1 with users by default; expandable to 1:N if a user manages multiple athlete profiles (rare).
- `coaches` table for coach profile metadata (a coach is also an athlete in the system).
- `athlete_coach_links` (athlete_id, coach_id, role: `PRIMARY` / `BACKUP` / `VIEWER`) carries the sharing relationship. Empty in P0.
- `athlete_follows` (follower_athlete_id, followed_athlete_id) for the minimal "other athletes" view in P2.
- **Every owned row carries `athlete_id`** (sessions, blocks, sets, cardio_segments, daily_metrics, injuries, journal_entries, goals, etc.).
- Authorization: app-level filter by `athlete_id` from the authenticated session's primary athlete profile. Postgres row-level security can come later if needed.

## Alternatives considered

### Alternative A — Single-user `user_id` everywhere, migrate later

- **Pros:** simpler schema, less foreign key choreography in P0.
- **Cons:** the migration when coach features land is ~2-3 days of focused work plus risk of forgetting one table. The cost of "always carry `athlete_id`" from day 1 is negligible (a column, a foreign key) — bordering on no cost at all.

### Alternative B — Multi-tenant + Postgres row-level security from day 1

- **Pros:** belt and suspenders; database refuses to leak data even if app layer has a bug.
- **Cons:** RLS adds complexity to migrations, makes Drizzle ergonomics harder, slows debug iteration. App-level enforcement is the right default for a single-developer solo project. RLS is a future-proofing option, not a P0 need.

### Alternative C — Chosen: multi-tenant schema, single-user UI in P0, RLS as a P2 option

This is the cheap insurance position. Schema is ready; UI gates expand later without schema churn.

## Consequences

### Positive

- Athlete↔coach linking in P1 is "add UI + a few queries", not "rewrite half the schema".
- Public profile view (username, training count, PRs) is straightforward — `athletes` already carries `username`.
- Schema clearly distinguishes auth (`users`) from training identity (`athletes`), which models reality (e.g., a coach watching multiple athletes via one login).

### Negative / trade-offs

- Every Drizzle query and AI tool needs `athlete_id` in its where-clause. Mistakes leak data.
- Tests must cover "athlete A cannot see athlete B's data" from day 1 (an authorization test, not just unit tests on logic).
- `users` ↔ `athletes` ↔ `coaches` 1:1 join feels verbose for a single-user MVP. Acceptable.

### Follow-ups

- First Drizzle migration creates `users`, `athletes`, `coaches` together. Default flow: new user creates one `athlete` profile automatically with a derived `username`.
- Add an authorization test harness (e.g., a Vitest/Bun-test fixture for "create two athletes, log session as A, assert B can't see it") as soon as the second route ships.
- Reconsider Postgres RLS when the first coach gets actual data access (P1/P2 boundary).

## References

- `docs/architecture/data-model.md` — see "Authentication & identity" section
- ADR-0004 — Better Auth (still current; supports the user-as-auth-principal pattern)
- `~/.claude/projects/-Users-chris-projects-forge/memory/forge-post-audit-scope.md`
