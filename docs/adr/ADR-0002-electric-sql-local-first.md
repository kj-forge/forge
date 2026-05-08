# ADR-0002: Electric SQL + TanStack DB for local-first sync

- **Status:** Accepted
- **Date:** 2026-05-07
- **Deciders:** @kj-ninja

## Context

The primary use case for Forge is logging sets in the gym, where Wi-Fi is unreliable. A traditional request-per-action architecture fails here. We need:

- Instant UI on every interaction (no network in the critical path).
- Reliable offline writes — sets logged offline must reach the server when connectivity returns.
- Conflict resolution if the same data is touched on two devices.

We also explicitly want to learn local-first sync, which is a topical 2026 area.

## Decision

Adopt a **local-first** architecture:

- **Postgres on Neon** is the source of truth.
- **Electric SQL** streams changes from Postgres (logical replication) over WebSocket to clients.
- **TanStack DB** holds the client-side reactive store, persisted to **IndexedDB** so data survives reloads.
- All UI reads/writes go to TanStack DB. Sync to Postgres happens in the background.

## Alternatives considered

### Service Worker cache + IndexedDB queue (pragmatic offline)

- Pros: simpler to set up, fewer moving parts.
- Cons: have to hand-roll sync logic, conflict resolution, retries — moves complexity into our app code.

### Convex (BaaS with built-in sync)

- Pros: best DX, real-time and offline out of the box.
- Cons: vendor lock-in, opinionated, not Postgres — moves us off the SQL ecosystem we want to learn.

### TinyBase / RxDB / Replicache

- Pros: each is a strong local-first store.
- Cons: weaker Postgres integration; sync still needs custom backend work in most cases.

## Consequences

### Positive

- UI is instant, even offline.
- Sync is provided by Electric — we don't write CDC code ourselves.
- Postgres remains the source of truth; we keep full SQL capabilities for analytics, RAG, exports.

### Negative / trade-offs

- Electric is younger than Postgres or TanStack — some operational unknowns.
- Logical replication adds DB load and a moving part (Electric server).
- Requires careful schema design for sync shapes (per-user scoping).

### Follow-ups

- Pick hosting for Electric: Electric Cloud (managed) vs self-host on Fly/Railway. Default: Electric Cloud, revisit on cost or limits (see [ADR-0007](ADR-0007-cloudflare-pages-workers.md) discussion).
- Define sync shapes per user in `app/lib/db/electric.ts`.
- Plan B: PowerSync — ready as a fallback if Electric doesn't meet our needs.
