# Architecture Decision Records

Non-trivial architectural decisions are recorded here as ADRs, following the format in [ADR-template.md](ADR-template.md).

ADRs are immutable once accepted. To change a decision, write a new ADR that supersedes the old one.

## Index

| ID | Title | Status |
| --- | --- | --- |
| [ADR-0001](ADR-0001-tanstack-start-frontend.md) | TanStack Start as the web framework | Accepted |
| [ADR-0002](ADR-0002-electric-sql-local-first.md) | Electric SQL + TanStack DB for local-first sync | Accepted |
| [ADR-0003](ADR-0003-postgres-neon-drizzle.md) | Postgres on Neon with Drizzle ORM | Accepted |
| [ADR-0004](ADR-0004-better-auth-strategy.md) | Better Auth with email magic link + Google OAuth | Accepted |
| [ADR-0005](ADR-0005-shadcn-tailwind-mobile-first.md) | shadcn/ui + Tailwind v4, mobile-first PWA | Accepted |
| [ADR-0006](ADR-0006-ai-stack.md) | Anthropic SDK + Vercel AI SDK + Deepgram for AI/voice | Accepted |
| [ADR-0007](ADR-0007-cloudflare-pages-workers.md) | Cloudflare Pages + Workers for hosting | Accepted |
| [ADR-0008](ADR-0008-linear-release-pipeline.md) | Linear release pipeline with main → staging → production | Accepted |
| [ADR-0009](ADR-0009-hyrox-data-model-rehab-tracking.md) | Hyrox-specific data model + rehab tracking as first-class domain | Accepted |
| [ADR-0010](ADR-0010-multi-tenant-schema.md) | Multi-tenant schema from day 1 (single-user UI in P0) | Accepted |
| [ADR-0011](ADR-0011-hybrid-workflow.md) | Hybrid workflow — small changes fast-track, epics through Linear + PR | Accepted |

## How to add an ADR

1. Open a Linear issue with the `ADR proposal` template
2. Discuss alternatives in the issue
3. Once decided, copy `ADR-template.md` to `ADR-NNNN-<slug>.md` (next free number)
4. Fill in context, decision, alternatives, consequences
5. Update this index
6. Open a PR; merge sets status to `Accepted`
