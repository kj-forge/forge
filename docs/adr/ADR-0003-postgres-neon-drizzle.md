# ADR-0003: Postgres on Neon with Drizzle ORM

- **Status:** Accepted
- **Date:** 2026-05-07
- **Deciders:** @kj-ninja

## Context

We need a relational database for training data (sessions, sets, daily notes), structured analytics, and embeddings (pgvector for RAG). The DB also needs to support logical replication for Electric SQL (see [ADR-0002](ADR-0002-electric-sql-local-first.md)).

Constraints:

- Cloud-hosted (the project is fully hosted, no self-managed infra on day 1).
- Free / cheap tier viable for a solo project.
- Standard Postgres — no lock-in.

## Decision

- **Database:** Postgres on **Neon** (serverless, scale-to-zero, branching).
- **ORM:** **Drizzle** — type-safe SQL builder + migrations. No heavy abstraction over Postgres; easy to drop to raw SQL when needed.
- **Vector search:** `pgvector` extension on the same Postgres instance.

## Alternatives considered

### Supabase

- Pros: Postgres + Auth + Realtime + Storage in one product.
- Cons: more managed surface area, our auth and storage needs are already covered by Better Auth and Cloudflare R2; we don't need the bundle.

### PlanetScale / TiDB (MySQL)

- Pros: serverless MySQL, branching.
- Cons: MySQL lacks logical replication suitable for Electric, no native vector type.

### Prisma (instead of Drizzle)

- Pros: more mature, broader ecosystem.
- Cons: heavier, slower runtime, schema-first feels less close to SQL — less aligned with the learning goal of getting comfortable with raw Postgres.

## Consequences

### Positive

- Standard Postgres — full power available (CTEs, JSONB, pgvector, materialized views).
- Drizzle keeps types tight while letting us write SQL when it's clearer.
- Neon branching pairs nicely with PR previews on Cloudflare.

### Negative / trade-offs

- Drizzle's ecosystem is smaller than Prisma's; fewer plug-and-play integrations.
- Logical replication on Neon needs a paid-tier check at scale — confirm before P1.

### Follow-ups

- Decide on schema scoping for Electric shapes (user-bound rows).
- Set up Neon branching automation in CI for PR DBs.
- Confirm logical replication / Electric compatibility with Neon's serverless model.
