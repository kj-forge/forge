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

## Project management

Work is tracked in Linear (initiative `Forge`). PRs link to Linear issues via the `## Linear` section in the PR template (see [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)).

Workflow is **hybrid** (since 2026-05-16, [ADR-0011](docs/adr/ADR-0011-hybrid-workflow.md)):

- **Small changes** (typos, single-file tweaks): fast-track without Linear ceremony.
- **Epic-level work**: Linear issue + branch `feat/frg-N-<short-scope>` + PR with self-review.

Release flow: `main` (DEV) → `staging` (STG) → `production` (PROD), automated via `.github/workflows/linear-release.yml` (sync issues to release stages on each push).

## Getting started

Requirements: [Bun](https://bun.sh) ≥ 1.3 and Node ≥ 22.

```bash
bun install
bun dev
```

The dev server runs at [http://localhost:3000](http://localhost:3000). The root route currently shows a TanStack Start server-function demo counter (placeholder; will be replaced by the real Quick Log UI in the next product PR). Styled with **Tailwind v4** + **shadcn/ui** (radix-nova preset).

The app exposes a Web App Manifest, so it's installable to the phone home screen ("Add to Home Screen"). The full offline shell (service worker + Workbox precache + offline mutation queue) is bundled with the Electric SQL local-first work — see [ADR-0002](docs/adr/ADR-0002-electric-sql-local-first.md).

### Useful scripts

```bash
bun dev           # start dev server (Vite + TanStack Start)
bun build         # production build
bun start         # serve the production build
bun test          # run unit tests (Bun test + happy-dom + Testing Library)
bun test:watch    # watch mode
bun run typecheck # tsc --noEmit
bun run lint      # Biome
bun run format    # Biome --write
bun run knip      # detect unused exports / deps / files
bun run check     # lint + typecheck + test + knip (full pre-PR gate)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, ADR process, and the hybrid workflow rules.

## License

MIT — see [LICENSE](LICENSE).
