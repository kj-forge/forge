# Database workflow — Forge cheat sheet

> Day-to-day commands, the migration lifecycle, the two seed scripts, and what to do when things go wrong. Targeted at a frontend dev who hasn't run a managed Postgres before.

---

## Where the database actually lives

```
                        ┌──────────────────────────────────────┐
                        │            Neon (cloud)              │
                        │  ┌────────────┐    ┌────────────┐    │
                        │  │ Postgres   │    │ Postgres   │    │
                        │  │ branch:    │    │ branch:    │    │
                        │  │   dev      │    │   main     │    │
                        │  │            │    │            │    │
                        │  │ Your dev   │    │ Production │    │
                        │  │ data       │    │ data       │    │
                        │  └─────▲──────┘    └─────▲──────┘    │
                        └────────│──────────────────│──────────┘
                                 │ HTTPS            │ HTTPS
                                 │                  │
        ┌────────────────────────┘                  └──────────────────┐
        │ DATABASE_URL                              DATABASE_URL       │
        │ (dev branch)                              (main branch)      │
        │                                                              │
┌───────┴────────────┐                                  ┌───────────────┴────────┐
│  Your laptop       │                                  │ Cloudflare Workers     │
│                    │                                  │ (production)           │
│  bun dev →         │                                  │ deployed Forge →       │
│  Drizzle ORM →     │                                  │ Drizzle ORM →          │
│  Neon HTTP →       │                                  │ Neon HTTP →            │
│  Postgres dev      │                                  │ Postgres main          │
└────────────────────┘                                  └────────────────────────┘
```

Three things to remember:

1. **Postgres lives in the cloud only.** You don't install Postgres on your laptop. `bun dev` connects to Neon over HTTPS just like your future production Worker will.
2. **Two branches, one Neon project.** `dev` is your playground. `main` is production-ready. Branches are copy-on-write, so they share storage until they diverge.
3. **Same driver everywhere.** `@neondatabase/serverless` (HTTP) on your laptop, in Workers, anywhere. No "works on my machine" issues at the data layer.

---

## Daily cheat sheet

```bash
# Run the app
bun dev                          # start dev server (localhost:3000)
bun build                        # production build (also generates routeTree.gen.ts)

# Quality gate
bun run check                    # lint + typecheck + test + knip — run before every PR
bun run format                   # auto-fix Biome formatting

# Database — daily
bun run db:studio                # open Drizzle Studio in browser (https://local.drizzle.studio)
bun run db:seed                  # idempotent — re-runs add nothing if catalogue is up to date
bun run db/seed-personal.local.ts  # personal race results (gitignored file you maintain)

# Database — when you change schema.ts
bun run db:generate              # diff schema.ts against existing migrations → new .sql file
bun run db:migrate               # apply pending migrations to the DATABASE_URL Neon branch
```

---

## One-time setup (already done if you've run through the README)

If you're starting fresh on a new machine or a teammate is onboarding:

1. **Sign up at https://console.neon.tech** (Google OAuth is the fastest path).
2. **Create a project** named `forge`. Region: Frankfurt (`eu-central-1`). Postgres version: 17.
3. **Make two branches.** Neon creates `main` automatically. In Branches → Create branch, make `dev` (parent: `main`).
4. **Grab the connection string** for `dev` from the Connection details panel. Pick the "Pooled connection" variant.
5. **Copy `.env.example` to `.env`** (gitignored) and paste the connection string into `DATABASE_URL`. Optionally set `SEED_DEMO_EMAIL` / `SEED_DEMO_NAME` / `SEED_DEMO_USERNAME` if you want the demo athlete to be you instead of the placeholder.
6. **Run `bun run db:migrate`** to create the 34 tables and 22 enums in your dev branch.
7. **Run `bun run db:seed`** to populate the catalogue (Hyrox stations, exercises, rehab protocols, demo athlete, goals).
8. **Verify with `bun run db:studio`.** You should see all 34 tables in the sidebar, with rows in `exercises`, `hyrox_stations`, `rehab_protocols`, `athletes`, `goals`.

---

## Migration lifecycle — how the schema evolves over time

The flow you'll repeat every time you add or change a column:

```
1. Edit db/schema.ts
   (e.g., add a `notes: text()` column to some table)
              │
              ▼
2. bun run db:generate
   → drizzle-kit diffs db/schema.ts against the existing migrations
   → writes a new file like db/migrations/0001_<random_word>.sql
   → that file contains the SQL needed to apply just your change
              │
              ▼
3. Read the generated SQL
   → drizzle-kit is usually fine but occasionally does something dumb
     (renaming a column comes out as DROP + ADD, which loses data —
      you'd hand-edit the SQL or split into two migrations in that case)
              │
              ▼
4. bun run db:migrate
   → drizzle-kit reads db/migrations/meta/_journal.json
   → sees which migrations the target DB has already applied
   → runs only the new ones (idempotent — safe to re-run)
   → records the new migration in the DB's __drizzle_migrations table
              │
              ▼
5. Commit BOTH together:
   - db/schema.ts (your edit)
   - db/migrations/0001_*.sql (the generated SQL)
   - db/migrations/meta/_journal.json + 0001_snapshot.json (drizzle bookkeeping)
              │
              ▼
6. PR → review → merge into main
              │
              ▼
7. Apply to production (the Neon main branch):
   → for now, manual:
       DATABASE_URL=<main branch URL> bun run db:migrate
   → later (separate epic): CI/CD runs this automatically on the deploy job
```

**Key rules:**

- **Migrations are immutable** once committed and applied anywhere. If a migration is wrong, you write a new migration to fix it. You don't edit the old `.sql` file.
- **Exception during early dev:** while only your dev branch has the schema (no prod, no other devs), you can drop everything and regenerate a fresh `0000_*.sql`. That's what we did once in PR #10 after the adversarial review surfaced fixes. Once anyone else is running the DB, no more rebases.
- **Never run `db:push` against main.** `db:push` skips the migration file and modifies the DB directly to match `schema.ts`. Convenient for solo iteration; destructive for shared environments. Default to `db:generate` + `db:migrate`.

---

## Seeding — two scripts, two purposes

### `bun run db:seed` — catalogue and demo athlete

What it inserts:

- 5 progression rules (TOP_SET_BACKOFF, STRAIGHT_SETS, ENDURANCE_STRENGTH, RPE_CAPPED, QUALITY_FIRST)
- 32 exercises with Polish aliases (siady, drążek, martwy, OHP, …)
- 8 Hyrox stations with Men's Open distances
- 2 rehab protocols (A foot/ankle, B VMO) with their exercises
- 1 demo athlete (placeholder unless you set `SEED_DEMO_*` env vars)
- 5 long-term goals for the demo athlete

**Idempotent.** Re-running is safe — the script `SELECT`s by natural key (`slug`, `email`, `username`, `(athlete_id, title)`) before inserting, and skips anything that already exists.

**When to re-run:** after adding new exercises or progression rules to `db/seed.ts`. It picks up the new ones and ignores the old.

### `bun run db/seed-personal.local.ts` — your personal data

This file is **gitignored**. Forge is a public repo, so personal data (real race results, real names) never gets committed. The template lives at `db/seed-personal.local.example.ts` — copy it to `db/seed-personal.local.ts` and fill it in:

```bash
cp db/seed-personal.local.example.ts db/seed-personal.local.ts
# Edit the new file with your real race data
bun run db/seed-personal.local.ts
```

The script looks up your demo athlete by email (`SEED_DEMO_EMAIL` from `.env`) and inserts race results under that athlete. Also idempotent.

---

## What happens in production (when we deploy)

When the app actually ships to Cloudflare Workers:

```
[Browser] ──► [Cloudflare CDN] ──► [Cloudflare Worker]
                                          │
                                          │ DATABASE_URL (encrypted secret)
                                          │
                                          ▼
                              [Neon HTTP gateway]
                                          │
                                          ▼
                              [Postgres main branch]
```

- `DATABASE_URL` is stored as a Cloudflare Workers Secret (Dashboard → Workers → `forge` → Settings → Variables → encrypted). It's the production analog of your local `.env`.
- It points to the **main** Neon branch (your `dev` branch stays private to your laptop).
- Migrations to main are still triggered manually for now: `DATABASE_URL=<main branch URL> bun run db:migrate` from your laptop. Future work (separate epic) ties this to a CI deploy job.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `DATABASE_URL is not set` when running any `db:*` script | No `.env` file or it doesn't have `DATABASE_URL` | `cp .env.example .env` and paste the Neon connection string |
| First query is slow (~500 ms) after a quiet period | Neon scale-to-zero — the instance was asleep | Normal cold start. Subsequent queries are fast. |
| `relation "exercises" does not exist` | Migration not applied to this branch | `bun run db:migrate` |
| `password authentication failed for user "..."` | Connection string is wrong, or password rotated | Re-copy from Neon → Connection details. If still failing, regenerate the password in Neon → Settings. |
| Seed says "0 new" everywhere | Catalogue already up to date — that's idempotency working. Not a bug. | If you actually wanted a clean slate: drop the Neon `dev` branch, create a fresh one from `main`, re-run `db:migrate` + `db:seed`. |
| `bun run db:generate` produces no migration after you changed `schema.ts` | Drizzle thinks there's no diff (maybe you reverted accidentally) | Check the actual diff in `db/schema.ts`. If you really did edit something, re-save and re-run. |
| Drizzle Studio shows "no connection" | DATABASE_URL is missing or pointing at an unreachable host | Re-check `.env`. Try `bun run db:studio` again. |
| You broke your dev branch and want to start over | Schema is corrupted, data is bogus, doesn't matter | In Neon UI: delete the `dev` branch, create a new one from `main`, then `bun run db:migrate && bun run db:seed`. Takes 30 seconds. |
| You see a CI failure on a CodeQL check after a PR | CodeQL scanned new code and raised a security alert | Open the PR → Checks → CodeQL → view the annotation. Fix the flagged code, push, CI re-runs. |
| `bun run db:migrate` shows `[⣯] applying migrations...error: script "db:migrate" exited with code 1` with no actual error message | `bunx --bun drizzle-kit migrate` runs drizzle-kit under Bun runtime; drizzle-kit's migration internals do something Node-specific that fails silently under Bun. The connection itself is fine — only drizzle-kit's `migrate`/`push`/`studio` commands hit it. | Our package.json `db:*` scripts use plain `bunx` (which defaults to Node) instead of `bunx --bun`. If you ever see this error, double-check the script doesn't have `--bun`. The connection-test snippet under "How to verify the DB connection separately from drizzle-kit" below confirms it's not the URL. |
| `[⣯] applying migrations...error` even with plain `bunx` | `@neondatabase/serverless` needs a Node-style WebSocket constructor for its `Pool` transport. Without it, the connection fails silently. | Make sure `ws` is installed (`bun add -D ws`) and `drizzle.config.ts` sets `neonConfig.webSocketConstructor = ws`. Both are committed in FRG-6. |

---

## How to verify the DB connection separately from drizzle-kit

When `bun run db:migrate` is acting weird, the fastest way to confirm "is this Neon, my URL, or drizzle-kit?" is to bypass drizzle-kit and talk to Neon directly:

```bash
bun -e '
import { neon, Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const url = process.env.DATABASE_URL;
console.log("URL host:", url.replace(/:[^@]+@/, ":***@"));

// HTTP fetch path (what the app runtime uses)
const sql = neon(url);
console.log("HTTP:", await sql`SELECT 1 as n, current_database() as db`);

// WebSocket path (what drizzle-kit migrate uses)
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: url });
console.log("WS:", (await pool.query("SELECT 1 as n, current_database() as db")).rows);
await pool.end();
'
```

If both queries succeed, the URL and credentials are fine — the issue is drizzle-kit specific. If one or both fail, you've narrowed it to the connection itself (URL typo, wrong branch, expired password).

---

## Quick Neon UI reference

Common things you'll click in https://console.neon.tech:

| You want to … | Where |
|---|---|
| Switch between branches | Top bar, project dropdown → branch selector |
| Get a connection string | Sidebar → Connection details → Pooled connection |
| Make a new branch (e.g., a one-off "scratch" branch for testing a migration) | Sidebar → Branches → Create branch |
| Reset your dev branch | Sidebar → Branches → select `dev` → Delete; then Create branch `dev` from `main` |
| See slow queries | Sidebar → Monitoring → Slow queries |
| Check storage usage | Sidebar → Settings → Usage |
| Roll the password | Sidebar → Settings → Reset password (then update `.env`) |

---

## Mental model summary

If you remember nothing else from this doc:

- **Postgres lives in Neon.** You connect to it over HTTPS via `@neondatabase/serverless`. Same setup on your laptop and on Workers.
- **`schema.ts` is the source of truth** for what tables exist. Migrations are the diffs that take the database from one schema.ts version to the next.
- **`db:generate` writes a migration file. `db:migrate` runs it against the DB.** Always commit both `schema.ts` and the generated migration together.
- **Seed scripts are idempotent.** Re-run whenever you want; they no-op on existing data.
- **The catalogue seed is public; personal data lives in a gitignored file.** Always.
- **When in doubt, drop and recreate the dev branch.** Cheap; takes 30 seconds.
