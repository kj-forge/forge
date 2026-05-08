# Forge

> Hybrid strength, forged daily.

A mobile-first PWA for tracking strength training and running. Local-first with Postgres + Electric SQL sync, AI coach (Claude) for auto-summaries, conversational logging, and natural-language queries over training history.

## Why this exists

I keep my training notes (strength 2×/week + running) in plain text. The notes contain sets, weights, reps, conclusions, and how my body felt that day. Forge replaces that notebook with an app that:

- logs sets fast on the gym floor (offline-first — gym wifi is unreliable),
- gives analytics and progression charts on the web,
- uses AI to analyse session data, generate auto-summaries, and answer natural-language questions about training history.

A second goal: train software engineering and product/architect skills on a modern 2026 stack.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | TanStack Start (Vite + React), TanStack Router/Query/DB/Form/Table |
| UI | shadcn/ui + Tailwind v4, Vaul (mobile drawers), Framer Motion |
| Charts | Tremor / Recharts |
| Backend | Server functions (TanStack Start) on Cloudflare Workers |
| Database | Postgres on Neon + Drizzle ORM |
| Local-first sync | Electric SQL → TanStack DB (IndexedDB) |
| Auth | Better Auth (email magic link via Resend + Google OAuth) |
| AI | Anthropic SDK (Claude Sonnet 4.6 / Opus 4.7), Vercel AI SDK, pgvector for RAG, Deepgram for STT |
| PWA | Vite PWA Plugin + Workbox |
| Hosting | Cloudflare Pages + Workers; Neon (Postgres); Electric Cloud (sync) |
| Observability | Sentry + PostHog |
| Tooling | Bun, Biome, Vitest, Playwright, Storybook, Lefthook |

See [docs/architecture/system-overview.md](docs/architecture/system-overview.md) for the system overview and [docs/adr/](docs/adr/) for architecture decisions.

## Project management

Work is tracked in Linear (initiative `Forge`). PRs link to Linear issues via the `## Linear` section in the PR template (see [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)).

Release flow: `main` (DEV) → `staging` (STG) → `production` (PROD), automated via `.github/workflows/linear-release.yml` (sync issues to release stages on each push).

## Getting started

> Scaffolding in progress — this section will be filled in once the TanStack Start app is set up.

```bash
bun install
bun dev
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, ADR process, and PR flow.

## License

MIT — see [LICENSE](LICENSE).
