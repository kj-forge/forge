# ADR-0007: Cloudflare Pages + Workers for hosting

- **Status:** Accepted
- **Date:** 2026-05-07
- **Deciders:** @kj-ninja

## Context

Forge needs hosting for the TanStack Start app (UI + server functions), with a path to add R2 storage (photo OCR uploads, future form check media). The user wants a fully cloud-hosted setup, low cost, and to learn the modern edge stack.

## Decision

- **Hosting:** **Cloudflare Pages + Workers** — TanStack Start has a native Cloudflare adapter; server functions deploy as Workers.
- **Storage:** **Cloudflare R2** for media (photos for OCR import, future form-check video).
- **DNS / TLS:** Cloudflare default.
- **Postgres:** Neon (separate from Cloudflare — see [ADR-0003](ADR-0003-postgres-neon-drizzle.md)).
- **Sync:** Electric Cloud (separate from Cloudflare — see [ADR-0002](ADR-0002-electric-sql-local-first.md)).

## Alternatives considered

### Vercel

- Pros: simplest possible deploy for React-stack apps.
- Cons: more expensive at scale, and the learning value of Cloudflare's edge primitives (R2, KV, D1, Workers) is greater for a learning project.

### Netlify

- Pros: works with Vite-based stacks.
- Cons: middle ground — neither cheapest nor most-learning-rich.

### Self-host on Coolify / Fly

- Pros: maximum DevOps learning.
- Cons: too much undifferentiated infra work for a solo project at MVP stage.

## Consequences

### Positive

- Edge runtime — low latency for server functions globally.
- R2 has zero egress fees — ideal for media-heavy features.
- Cloudflare's free tier is generous for a solo project.

### Negative / trade-offs

- Workers run on a constrained runtime (no Node APIs by default) — some libraries need substitutes.
- Long-running tasks (e.g., AI generation) can hit the Workers CPU/time limits — may need to split work or use Workflows.

### Follow-ups

- Set up three Pages environments mapped to `main` (preview), `staging`, `production`.
- Configure the Cloudflare adapter in `app.config.ts` once the app is scaffolded.
- Verify that Anthropic SDK and Drizzle work on the Workers runtime (or add fetch-based adapters).
