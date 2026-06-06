# Forge learning notes

Living documentation written for someone who's good at frontend (React, TypeScript, Vite, modern tooling) but is treating Forge as a deliberate way to pick up the parts of full-stack that aren't day-to-day — Postgres, ORMs, sync engines, AI infra, observability.

These are not architecture decision records (those live in [`docs/adr/`](../adr/)) and not API/system reference (that lives in [`docs/architecture/`](../architecture/)). They are **explanations and cheat sheets** — written deliberately to be re-readable in five months when something has gone fuzzy.

## Files

| File | What's in it |
|---|---|
| [database-concepts.md](database-concepts.md) | The ten backend concepts you'll meet over and over — primary keys, foreign keys, constraints, indexes, cascades, enums, jsonb, timezones, soft delete (and why we don't use it), denormalization — each with a frontend analogy and concrete Drizzle examples. |
| [database-workflow.md](database-workflow.md) | The day-to-day cheat sheet: where the DB lives, how to run things locally, the full migration lifecycle, the two seed scripts, common gotchas, and a quick Neon UI reference. |

## How to use these

- **Before** starting a new feature that touches the DB: skim [database-workflow.md](database-workflow.md).
- **When** something breaks in dev or you can't remember how migrations work: same file, the troubleshooting section is at the bottom.
- **When** you see a term in a PR review or ADR that you can't immediately picture: [database-concepts.md](database-concepts.md) is the lookup.
- **When** you can confidently explain every concept here without looking, this section has served its purpose; you can keep it as a portfolio artifact or fold it into the main docs.

## How to extend these

- New foundational concept comes up (e.g., row-level security when auth lands, or vector embeddings when AI lands): add a new file or a new section to the relevant file.
- A workflow changes (e.g., CI starts running migrations automatically): update [database-workflow.md](database-workflow.md) and mark the old approach as historical.
- Keep things **concrete** — show real Forge code, not abstract toy examples. The whole point is to make the unfamiliar familiar through the project you're already building.
