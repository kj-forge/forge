# Deploy and environments — concept walkthrough

Forge runs on Cloudflare Workers. This is the "what changes when an app stops being local-only" doc, written for someone who has shipped Node services before but is new to edge runtimes, Wrangler, and the modern Vite-based deploy story.

If you only want the operational checklist, see [`docs/runbooks/deploy.md`](../runbooks/deploy.md). This document is the concept-level prequel.

---

## 1. What "production" actually is

A production deploy is three independent things glued together:

1. **A place that runs server code.** Loads when a request comes in, evaluates JS, returns a response. Locally that's `bun dev`. In production it's Cloudflare's V8 isolate pool running on hundreds of edge locations.
2. **A place that stores state.** Locally that's the Neon `dev` branch. In production it's the Neon `production` branch — same Postgres engine, different connection string, different data, separate failure domain.
3. **A way for users to reach it.** Locally it's `http://localhost:3000`. In production it's `https://<worker>.<account>.workers.dev` with Cloudflare-managed TLS.

Plus three cross-cutting things:

- **Secrets** (DB connection string, auth secret, OAuth credentials, API keys) — must reach the server at runtime, must NEVER reach git or the client bundle.
- **External services config** (Google OAuth redirect URI, Resend sender domain) — must agree with whatever URL the server thinks it has.
- **Observability** — without it, you find out something is broken when a user tells you.

This document explains how each of those works on Cloudflare. The two production-only parts that aren't this PR (security/allowlist + Sentry/backups) get their own learning docs in later epics.

---

## 2. Edge runtime in one paragraph

A Cloudflare Worker is not a Node.js process. It's a V8 isolate — the same engine that runs JavaScript in Chrome, but stripped to just the language plus a small set of platform APIs. There is no event loop in the Node sense, no file system, no `process` argv, no long-lived sockets. Each request is a short-lived invocation that gets a fresh `Request`, runs your handler, returns a `Response`, and the isolate goes idle (or gets garbage collected).

Why this matters for Forge:

- **No Node `crypto`/`fs`/`net`.** We enable the `nodejs_compat` compatibility flag in `wrangler.jsonc` so libraries that reach for Node built-ins (Better Auth, Resend, Drizzle/Neon) get polyfills. Without the flag the build fails at deploy time.
- **No persistent state between requests.** A module-scope cache works for things you can rebuild (like a parsed config), but anything that holds an OS resource — a database connection, a long-lived socket — is a bug waiting to happen. See §5 on the Neon pool refactor.
- **Bundle size matters.** Free-tier worker bundle is capped at 3MB compressed. Forge's current server bundle is ~120KB gzipped; comfortable but worth watching.

The Cloudflare Vite plugin embeds a Workers runtime (called miniflare) inside `bun dev`, so day-to-day local development executes under the same constraints as production. That's how you catch "this only works because Node has `fs`" early.

---

## 3. The build adapter — what `@cloudflare/vite-plugin` actually does

Vite is a generic bundler. Out of the box it produces a Node-targeted output. To make a Workers-targeted output, you need an adapter that:

1. Tells Vite which environment to use during SSR (the `ssr` environment, scoped to V8 conditions).
2. Generates a Workers-shaped entry file (`dist/server/index.js`) that knows how to translate an incoming `Request` into your framework's handler invocation.
3. Generates a deploy-ready `wrangler.json` next to the build output, with the assets binding (`dist/client`) and the compatibility flags merged in.
4. Embeds miniflare in `bun dev` so server functions execute under Workers semantics locally.

`@cloudflare/vite-plugin` is the official package that does all four. In `vite.config.ts` it's the first plugin in the array — it has to wrap the SSR environment before TanStack Start hooks its server-fn machinery into it. The `viteEnvironment: { name: 'ssr' }` arg tells it which Vite environment to attach to (TS Start calls its SSR env "ssr").

There used to be a community workaround using `wrangler-vite` or custom Vite plugins. Don't reach for those — the official plugin is the documented path now.

---

## 4. Wrangler — Cloudflare's CLI

Mental model: like the `vercel` or `fly` CLI, but Cloudflare-specific. Five things it does that you'll use:

| Command | Purpose |
|---|---|
| `wrangler login` | One-time browser-based OAuth so your local CLI can talk to your CF account. Stored in `~/.wrangler`. |
| `wrangler deploy` | Uploads the build output (`dist/server/index.js` + `dist/client/`) plus the resolved config and deploys it. |
| `wrangler dev` | Runs your worker locally with the full Workers runtime (slower than `vite dev` but closest to production). Aliased as `bun run preview`. |
| `wrangler secret put <NAME>` | Stores a secret in Workers Secrets (encrypted at rest, injected as `process.env.NAME` at runtime). |
| `wrangler tail` | Streams logs from the deployed worker to your terminal. Useful when debugging a production-only issue. |

Wrangler reads `wrangler.jsonc` from the repo root. The build also writes a resolved `wrangler.json` to `dist/server/` — that's the one actually used at deploy time, and it merges your config with framework-specific bindings.

For Forge specifically, the most important field is `compatibility_flags: ["nodejs_compat"]`. Drop it and the deploy fails.

---

## 5. The database driver story under Workers

This is the trickiest part of FRG-10 and the bit most likely to bite you if you start adding more transactional flows.

Forge uses Drizzle with **two clients**:

- **`db` (HTTP driver, `drizzle-orm/neon-http`)** — every query is a single HTTP request to Neon. No connection state, no socket, no pool. Trivial to use under Workers because it's just `fetch()` under the hood. Limitation: cannot wrap multiple statements in a transaction.
- **`db` returned by `createPool()` (WebSocket pool, `drizzle-orm/neon-serverless`)** — opens a WebSocket to Neon, can run transactions, behaves like a real Postgres connection.

The catch: Workers terminates idle sockets between requests. A module-scope `Pool` instance — which is what the original code had — works for the first request and then breaks silently when the runtime reaps the socket. You don't get an error at deploy time. You get intermittent "connection lost" errors in production weeks later.

The fix is `db/pool.ts` exporting a `createPool()` **factory** that:

1. Polyfills the WebSocket constructor if running on Node/Bun (drizzle-kit migrate, local seed scripts). Skips on Workers because Workers has `WebSocket` globally.
2. Returns `{ db, end }` — a fresh pool every call.

Callers always:

```ts
const { db, end } = await createPool();
try {
  return await db.transaction(async (tx) => { ... });
} finally {
  await end();
}
```

Cost: ~50-150ms of WebSocket handshake per call. Acceptable because the two flows that use it (signup, strength session creation) are low-frequency — once per user, once per workout. If we ever add a transaction inside a hot path, the answer is to rewrite it as a single-statement CTE on the HTTP driver, not to share a pool.

The `ensureAthlete` function previously did a single SELECT on the pool, which was wasteful — it didn't need a transaction. Switched to the HTTP `db` client in this PR; saves a handshake on every login.

---

## 6. Secrets vs vars vs `import.meta.env`

Three different mechanisms, three different scopes. They all look similar in a `.env` file but mean different things at deploy time.

**Workers Secrets** (`wrangler secret put`):
- Encrypted at rest in Cloudflare's storage.
- Injected as `process.env.NAME` at runtime, only on the server.
- Never appear in `wrangler.jsonc` or in the build artifact.
- Use for: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `GOOGLE_CLIENT_SECRET`.

**Workers Vars** (`vars` in `wrangler.jsonc`):
- Plain text in the config file, visible in the dashboard.
- Injected as `process.env.NAME` at runtime.
- Use for: non-secret feature flags, environment markers. Forge has none right now.

**Vite client env** (`import.meta.env.VITE_*`):
- Inlined into the client bundle at build time. Anyone with the bundle can read them.
- Use ONLY for values the client genuinely needs (e.g., `VITE_APP_URL` so the auth client knows where the API lives).
- **Critical:** these are baked at build time, not at request time. If the `VITE_APP_URL` GitHub secret is wrong when CI runs the build, the client will hardcode the wrong URL until a redeploy.

In Forge the same value can live in two places — `VITE_APP_URL` is both a Workers Secret (server reads it via `process.env`) and a build-time client constant (client reads it via `import.meta.env`). One env value, two namespaces. Wasteful? Slightly. Correct? Yes — the alternatives (server endpoint discovery, runtime URL probing) are worse.

The GitHub Actions deploy workflow handles the duality: the build step sets `VITE_APP_URL` as a process env (so Vite inlines it), and the deploy step pipes the same value through `wrangler secret put` (so the server reads it from `process.env` at runtime).

---

## 7. Migrations in production

This is the part where you can corrupt user data with a single PR if you get it wrong, so it deserves its own section.

Drizzle migrations are SQL files in `db/migrations/`. They're applied by `drizzle-kit migrate` which uses the `DATABASE_URL` env var to figure out which database to apply them to. In dev, that's your Neon dev branch. In the deploy CI job (triggered by a push to `production`), that's the Neon production branch.

The deploy workflow runs `bun run db:migrate` **before** `wrangler deploy`. The ordering is intentional and the inverse is dangerous:

- If migrate runs after deploy, new code is talking to old schema for the gap — anywhere from seconds to minutes. Queries break.
- If migrate runs before deploy, old code is talking to new schema. As long as the schema change is **additive** (new column with default, new table, new index), old code is unaffected.

This is the "expand" half of the **expand-then-contract** pattern. The discipline is:

- **Add new things in the same PR as the code that starts using them.** Safe — old code ignores the new columns.
- **Drop old things in a follow-up PR, after the code that stopped using them is already deployed.** FRG-9 did this correctly: migration 0002 added `set_kind` (additive), 0003 dropped `is_warmup` (destructive) — but both shipped together while the table was still empty, so the contract step was free.

If you ever rename a column, do it as: add new column → backfill in code → switch reads/writes to new column → ship → drop old column in a follow-up.

If a migration fails in CI, the deploy is aborted automatically (`needs: migrate` in `deploy.yml`). The old worker keeps serving traffic with the old schema. No partial state.

If a deploy fails after migrate succeeded, the new schema is there but the new code isn't — additive migrations make this safe by design.

---

## 8. Local Workers parity — `vite dev` vs `wrangler dev`

Two ways to run Forge locally, two different fidelity levels.

**`bun dev` (= `vite dev`)** — fast, hot module reload, miniflare embedded by the Cloudflare plugin. The server runs under Workers conditions but the dev-loop is Vite-fast. Day-to-day default.

**`bun run preview` (= `wrangler dev`)** — slower start, no HMR, but uses the actual Wrangler dev server. Closest to production. Use it before pushing a deploy-affecting change (anything touching `wrangler.jsonc`, the build adapter, environment access patterns).

Both use the same `.dev.vars` file (gitignored, key=value format) for local secrets. `bun dev` ALSO reads `.env` for compatibility with the existing dev workflow. Mirror your secrets into both files when needed.

The "verification gate" in the deploy plan is `wrangler dev` works locally. If it does, the deployed worker is overwhelmingly likely to work too — they share runtime, only the network path differs.

---

## 9. What happens at deploy time, step by step

Forge uses a **promote-to-prod** branching model. Day-to-day, PRs merge into `main` and CI runs there but no deploy fires. When ready to ship, you promote `main` to `production`:

```sh
git push origin main:production
```

(Or open a PR `main → production` in the GitHub UI and merge it — same effect.) Only the push to `production` triggers the deploy workflow.

This gives an explicit gate between "merged" and "live". It's not free — one extra command per release — but it eliminates the "I merged a typo and prod is down" failure mode. At our scale (KJ is sole maintainer, 3-5 testers) the gate is cheap; at scale-with-a-team it would become the bottleneck and we'd add `[env.staging]` instead.

The flow once you push to `production`:

1. **GitHub Actions checks out the repo.**
2. **`verify` job** — re-runs lint + typecheck + unit tests inline. Cheap defence against force-pushes or admin merges that bypassed the PR gate to `main`.
3. **`migrate` job** — `drizzle-kit migrate` connects to the Neon prod branch using `DATABASE_URL` from repo secrets, applies any new migrations, exits.
4. **`deploy` job:**
   - Builds the worker (`bun run build`) with `VITE_APP_URL` set so the client bundle gets the right URL inlined.
   - `cloudflare/wrangler-action@v3` reads each secret listed in its `secrets:` input from the action env (which comes from repo secrets) and runs `wrangler secret put` for each, then runs `wrangler deploy`.
   - Cloudflare's edge propagates the new worker globally (usually 5-30 seconds).
5. **You verify by visiting the URL.** Magic link should work, OAuth should work, strength session should persist. See [`docs/runbooks/deploy.md`](../runbooks/deploy.md) §smoke test.

Total time from `production` push to live: typically 3-5 minutes. If any step fails, the previous version of the worker keeps serving traffic — Cloudflare doesn't tear down the old deployment until the new one is healthy.

---

## 10. What this PR explicitly does NOT do

Important to keep in your head when reading the deploy code or the runbook:

- **No allowlist.** Anyone with the workers.dev URL can sign up. We mitigate by simply not sharing the URL beyond two testers until PR-B lands.
- **No bot protection.** Cloudflare's free Bot Fight Mode kicks in only when you bind the worker to a custom domain or explicitly enable it; we haven't.
- **No security headers** (CSP, HSTS, X-Frame-Options). Default Cloudflare headers only. PR-B fixes this.
- **No Sentry / error tracking.** If something throws in prod, you see it in the Cloudflare dashboard logs (observability is on) — but you have to look. PR-C wires Sentry.
- **No backups beyond Neon PITR.** Free-tier Neon point-in-time recovery covers ~24h. PR-C decides whether to add a daily `pg_dump` to R2 or accept the limit.
- **No staging environment.** `main` is prod. If we get burned, PR-D adds `[env.staging]`.

That's not laziness — it's PR-sized scope. Each layer is its own ADR + learning doc.

---

## 11. Mental model for future epics

When you add a new feature that touches the deploy story, ask these in order:

1. **Does it work under V8?** Run `bun run preview` (wrangler dev) and exercise the flow. If a dep imports `fs` or `net`, you'll see it here, not in production.
2. **Does it hold runtime state between requests?** If yes (sockets, intervals, caches that must survive), it's a bug. Move state to Neon / KV / Durable Objects.
3. **Does it need a new secret?** Add it to: `.env.example`, `.dev.vars` (your local), GitHub repo secrets, the `secrets:` block in `deploy.yml`. Four places. Missing one = production breaks silently.
4. **Does it change the schema?** Generate the migration with `bun run db:generate`, verify it's additive, ensure the code change can run against both the old and new schema for the deploy gap.
5. **Does it change `VITE_APP_URL` semantics?** If yes (custom domain, subdomain change), update the secret in GitHub and Google OAuth redirect URIs.

Most epics will only need #1. Schema and secrets are rare. The runbook in `docs/runbooks/deploy.md` covers the manual procedures for each of these.
