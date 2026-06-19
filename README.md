# Forge

> Hybrid strength, forged daily.

A mobile-first PWA — **Hyrox athlete journal with rehab tracking, daily wellness metrics, and AI-driven weekly summaries**. Local-first with Postgres + Electric SQL sync; AI insights powered by Claude.

## Why this exists

I train for Hyrox (Sub-65' Gdańsk Oct 2026 target), am currently rehabbing a tendon injury, and follow a structured weekly cycle (PON Hyrox, WTO siłowy, ŚRO rehab, CZW siłowy, PT Hyrox z fizjo, SOB long Z2/3, ND reset). My training notes — multi-paragraph reflections, EMOM/AMRAP/WORK blocks, Sleep Score / HRV / HR Rest, rehab protocols A/B with meds and USG — live in scratch documents. Forge replaces that with an app that:

- logs sets fast on the gym floor (offline-first — gym wifi is unreliable),
- structures every training format I actually do (strength + Hyrox formats + compromised run + cardio zones + rehab),
- tracks rehab as a first-class domain (Protokół A: Foot/Ankle, Protokół B: VMO, injuries timeline, pain check-ins, meds),
- captures daily wellness (Sleep, HRV, HR Rest, weekly volume),
- uses Claude AI to generate weekly summaries (strength progress, average HR per zone, sleep trends, session-to-session comparisons),
- supports athlete↔coach sharing and minimal "other athletes" view (P1/P2),
- imports Garmin data via manual `.FIT` upload (P1) and the official Garmin Health API once registered.

A second goal: train software engineering and product/architect skills on a modern 2026 stack.

Original (pre-audit) scope was "generic training PWA for strength + running with daily notes". After a multi-agent audit on 2026-05-16 captured the actual use case in [`/tmp/forge-user-notes.md`](https://github.com/kj-forge/forge/blob/main/docs/architecture/data-model.md) (and the resulting [ADR-0009](docs/adr/ADR-0009-hyrox-data-model-rehab-tracking.md)), the scope was re-framed as above.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | TanStack Start (Vite + React 19), TanStack Router/Query/DB/Form/Table |
| UI | shadcn/ui (radix-nova) + Tailwind v4, Vaul (mobile drawers); animation library TBD |
| Charts | Tremor / Recharts for dashboards; `visx` for race recap (P1) |
| Backend | Server functions (TanStack Start) on Cloudflare Workers |
| Database | Postgres on Neon + Drizzle ORM + pgvector (RAG) |
| Local-first sync | Electric SQL → TanStack DB (IndexedDB) — scope subscriptions by 90-day window |
| Auth | Better Auth (email magic link via Resend + Google OAuth); multi-tenant schema from day 1 |
| AI | Anthropic SDK (Claude Sonnet 4.6 default, Opus 4.7 for weekly summaries), Vercel AI SDK, Deepgram for STT (PL), pgvector for embedding-based similar-session search |
| Wearable | Manual `.FIT` upload (P1) + Garmin Health API once registered (P2); enum `ImportSource` future-proofs swaps |
| PWA | Vite PWA Plugin (manifest only; service worker bundled with Electric SQL PR) |
| Hosting | Cloudflare Pages + Workers; Neon (Postgres); Electric Cloud (sync); R2 (media + nightly DB backups) |
| Observability | Sentry + PostHog (events only — never reflection text or pain notes; health-adjacent stays out of analytics) |
| Tooling | Bun, Biome, Bun test + happy-dom + Testing Library, Playwright (post-MVP), Storybook (post-MVP), husky + commitlint + knip |

See [docs/architecture/system-overview.md](docs/architecture/system-overview.md) for the system overview, [docs/architecture/data-model.md](docs/architecture/data-model.md) for the schema, and [docs/adr/](docs/adr/) for architecture decisions (11 ADRs as of this writing).

## Project structure

Feature-first layout (Bulletproof React-style, pragmatically applied — see [ADR-0018](docs/adr/ADR-0018-folder-architecture.md) for the full decision + rationale + alternatives considered).

```
src/
  routes/                 # TanStack Start file-based routing. Thin (~20 lines):
                          #   createFileRoute + import <View /> from features/.
  features/<feature>/     # All domain code for one feature. Folders are named
                          # by RUNTIME — where the code executes:
    server/               #   Server-side code: createServerFn RPC endpoints
                          #   (one file per resource), library instances
                          #   (Better Auth), server-only helpers. Files
                          #   plain-named, NOT *.server.ts — that extension
                          #   triggers TanStack Start's import-protection and
                          #   breaks the RPC split.
    client.ts             #   Client-only non-React code (browser SDK wrappers).
                          #   Promote to client/ folder when it outgrows a file.
    views/                #   Top-level entry components. Imported by exactly
                          #   one route. Naming: <Name>View.tsx.
    components/           #   Reusable building blocks within the feature.
    forms/                #   Vertical form slices: Zod schema + RHF + submit.
    lib/                  #   Universal non-React helpers (one per file).
    constants.ts          #   Enums, label maps.
    types.ts              #   Feature-scoped TypeScript types.
  shared/
    components/           # Cross-feature business components (Spinner,
                          # StatusBadge — used by 2+ features, have business
                          # semantics, not pure UI primitives).
  components/
    ui/                   # shadcn primitives. Pure UI, no business knowledge.
  lib/                    # Cross-cutting non-React utilities (cn, env, session).
```

**Three-tier component model:** UI primitive (`components/ui/`) → cross-feature shared (`shared/components/`) → feature-specific (`features/<feat>/components/`). A view is what a page renders; a component is what a view is built from. Routes stay thin.

## Project management

Work is tracked in Linear (initiative `Forge`). PRs link to Linear issues via the `## Linear` section in the PR template (see [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)).

Workflow is **hybrid** (since 2026-05-16, [ADR-0011](docs/adr/ADR-0011-hybrid-workflow.md)):

- **Small changes** (typos, single-file tweaks): fast-track without Linear ceremony.
- **Epic-level work**: Linear issue + branch `feat/frg-N-<short-scope>` + PR with self-review.

Release flow: `main` (DEV) → `staging` (STG) → `production` (PROD), automated via `.github/workflows/linear-release.yml` (sync issues to release stages on each push).

## Getting started

Requirements: [Bun](https://bun.sh) ≥ 1.3 and Node ≥ 22.

### 1. Install dependencies

```bash
bun install
```

### 2. Set up the database (Neon Postgres)

Forge uses [Neon](https://neon.tech) as managed Postgres. Sign up (Google OAuth is fastest), create a project called `forge`, and copy the **pooled** connection string from the Connection Details panel.

Then create a local `.env` (gitignored) from `.env.example` and paste the connection string:

```bash
cp .env.example .env
# Edit .env, set DATABASE_URL to your Neon connection string.
```

Run the initial migration + catalogue seed (Hyrox stations, exercises with PL aliases, rehab protocols, demo athlete, long-term goals):

```bash
bun run db:migrate    # applies db/migrations/*.sql to the DB
bun run db:seed       # idempotent — seeds catalogue + demo athlete
```

To seed under your own identity instead of the placeholder "demo athlete", set in `.env`:

```bash
SEED_DEMO_EMAIL="you@example.com"
SEED_DEMO_NAME="Your Name"
SEED_DEMO_USERNAME="your-handle"
```

Personal race results (Hyrox splits with real times) are seeded separately via the gitignored `db/seed-personal.local.ts` — copy `db/seed-personal.local.example.ts` to that filename and fill in your data. Public repo never sees real race data.

### 3. Start the dev server

```bash
bun dev
```

Dev server runs at [http://localhost:3000](http://localhost:3000). The root route currently shows a TanStack Start server-function demo counter (placeholder; will be replaced by the real Quick Log UI in the next product PR). Styled with **Tailwind v4** + **shadcn/ui** (radix-nova preset).

The app exposes a Web App Manifest, so it's installable to the phone home screen ("Add to Home Screen"). The full offline shell (service worker + Workbox precache + offline mutation queue) is bundled with the Electric SQL local-first work — see [ADR-0002](docs/adr/ADR-0002-electric-sql-local-first.md).

### Useful scripts

```bash
bun dev               # start dev server (Vite + TanStack Start)
bun build             # production build
bun start             # serve the production build
bun test              # run unit tests (Bun test + happy-dom + Testing Library)
bun test:watch        # watch mode
bun run typecheck     # tsc --noEmit
bun run lint          # Biome
bun run format        # Biome --write
bun run knip          # detect unused exports / deps / files
bun run check         # lint + typecheck + test + knip (full pre-PR gate)

bun run db:generate   # generate SQL migration from db/schema.ts diff
bun run db:migrate    # apply pending migrations to DATABASE_URL
bun run db:push       # sync schema directly without migration (DEV ONLY — destructive)
bun run db:studio     # open Drizzle Studio (GUI at https://local.drizzle.studio)
bun run db:seed       # seed catalogue + demo athlete (idempotent)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, ADR process, and the hybrid workflow rules.

## License

MIT — see [LICENSE](LICENSE).
