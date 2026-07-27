# ADR-0024: Retire the local-first sync architecture (Electric SQL)

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** @kj-ninja

## Context

ADR-0002 (2026-05-07) committed Forge to a local-first architecture: Electric SQL
streaming Postgres changes into a TanStack DB store persisted in IndexedDB, with all
UI reads and writes going through the local store. Fourteen months later, none of it
has been built — there is no Electric, TanStack DB, or IndexedDB code or dependency
in the repo. The MVP shipped and is used daily on a simpler architecture: server
functions hitting Neon directly, with TanStack Query as the client cache.

Two assumptions behind ADR-0002 did not hold up:

- **"Gym Wi-Fi is unreliable"** — in practice connectivity at the gyms where Forge
  is used has been consistently good. The one genuinely latency/offline-critical
  flow (the Hyrox live timer) got a targeted solution instead: a localStorage
  journal with DB rehydrate (ADR-0023), which has proven sufficient.
- **"We want to learn local-first sync"** — the project's learning focus has moved
  to infrastructure, security, and backend performance. A sync engine is a large,
  ongoing complexity budget (sync shapes, conflict semantics, a second source of
  truth on every device) that no longer buys learning we want.

The PWA requirement has also been clarified: the app must be installable to the
home screen, nothing more. A web app manifest alone satisfies installability on
both iOS and modern Chrome; no service worker is required.

## Decision

Retire the local-first plan. Forge stays **online-first**: Neon Postgres is the
single source of truth, all reads and writes go through server functions, and
client-side caching is TanStack Query's job. The PWA scope is **manifest-only**
(installable to home screen); the service worker and offline shell are removed
from the roadmap, not deferred. This supersedes ADR-0002.

## Alternatives considered

### Alternative A — Keep ADR-0002 and implement Electric SQL later

- Pros: instant UI regardless of connectivity; conflict resolution handled by the
  sync engine; the original learning goal stays alive.
- Cons: a permanent second data layer to reason about (every schema change must
  consider sync shapes and per-user scoping); operational moving part between
  Neon and every client; solves a problem daily usage shows we don't have.

### Alternative B — Lighter offline: service worker + queued writes

- Pros: much smaller than a sync engine; covers the "log a set in a dead zone"
  scenario without replicating the database.
- Cons: hand-rolled retry, ordering, and conflict logic in app code; a service
  worker cache is a notorious source of stale-bundle bugs; still speculative —
  the only flow that demonstrably needed offline durability (live timer) already
  has its localStorage journal.

### Alternative C — Swap the engine (PowerSync, Convex, Replicache)

- Pros: same promises as Electric with different trade-offs; Convex would also
  remove backend plumbing.
- Cons: identical category of complexity and lock-in; doesn't address the actual
  reason for retiring — the requirement disappeared, not the vendor.

## Consequences

### Positive

- One source of truth and one mental model: browser → Worker → Postgres.
- Schema design is freed from sync-shape constraints (per-table scoping for
  replication windows, tombstones, etc.).
- Backend latency work (upcoming infra epic) targets the path users actually hit;
  cache layering is explicit: TanStack Query in the client, HTTP/edge caching as
  measured needs appear.
- Docs stop describing a system that doesn't exist.

### Negative / trade-offs

- No offline logging: in a true dead zone, writes outside the live timer fail
  visibly instead of queueing.
- Every interaction pays a network round trip (Worker + Neon), which raises the
  stakes on the performance phase of the infra epic.
- The "learn local-first sync" goal is dropped, not just postponed.

### Follow-ups

- Purge Electric SQL / TanStack DB / IndexedDB from `docs/architecture/`
  (system-overview.md, data-model.md) as part of the infra-epic architecture
  audit; this PR already removes the mentions in README and package.json.
- Keep `vite-plugin-pwa` scoped to manifest generation only; no service worker
  registration.
- Revisit only if a real, recurring offline failure shows up in production
  telemetry once observability lands.

## References

- [ADR-0002](ADR-0002-electric-sql-local-first.md) — the superseded decision.
- [ADR-0023](ADR-0023-hyrox-training-data-model.md) — localStorage journal for the
  live timer, the targeted offline solution that made the general one unnecessary.
- [docs/learning/hyrox-live-timing.md](../learning/hyrox-live-timing.md) — how the
  journal + rehydrate flow works.
