# ADR-0017: Cloudflare Workers deploy pipeline + Workers-compatible runtime refactor

- **Status:** Accepted
- **Date:** 2026-06-09
- **Deciders:** @kj-ninja
- **Linear:** [FRG-10](https://linear.app/kj-forge/issue/FRG-10)
- **Refines:** [ADR-0007](ADR-0007-cloudflare-pages-workers.md) (hosting choice)

## Context

[ADR-0007](ADR-0007-cloudflare-pages-workers.md) accepted Cloudflare as the host before any deploy had been attempted. With the strength MVP shipped and a need to put Forge in front of 3-5 testers, the implementation choices have to be made for real: which Cloudflare product (Pages vs Workers), which adapter, how secrets flow, how CI deploys, and what code has to change to survive a V8 isolate runtime.

Constraints active at the moment of decision:

- ~5 testers; nothing publicly shared yet (security layer is the next epic, not this one).
- Free tier across the stack (Cloudflare Workers, Neon, Resend) is sufficient.
- No custom domain yet — `*.workers.dev` is acceptable.
- Future monetization is on the table, so platform choices should not be migration-prone.
- Two transactional flows exist that use the Neon WebSocket pool: signup hook (`runSignupTransaction`) and strength session creation (`runCreateSession`). Both worked locally under Node; both need to keep working under V8.

## Decision

### Hosting: Workers (not Pages)

The official TanStack Start adapter documented in 2026 targets **Cloudflare Workers** via `@cloudflare/vite-plugin`. The Pages path is older, less documented for TanStack Start, and Cloudflare is steering teams toward Workers + static assets binding (the Pages product is being subsumed). One product, one deploy story.

### Adapter: `@cloudflare/vite-plugin`

Added as the first plugin in `vite.config.ts` with `viteEnvironment: { name: 'ssr' }`. The plugin:

- During `bun dev`: embeds a Workers runtime (miniflare) inside Vite so server functions execute under V8 conditions locally — close-to-prod parity with full HMR.
- During `bun run build`: emits a Workers-compatible `dist/server/index.js` plus a generated `dist/server/wrangler.json` containing the resolved config, the assets binding (`dist/client`), and the compatibility flags.

### Config: `wrangler.jsonc`

JSONC (not TOML) — newer Wrangler features are JSON-only, and JSONC allows inline comments that explain non-obvious choices. Minimal config:

```jsonc
{
  "name": "forge",
  "main": "@tanstack/react-start/server-entry",
  "compatibility_date": "2026-06-09",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true }
}
```

`nodejs_compat` is required because Better Auth, Resend, and Drizzle/Neon all reach for Node built-ins (`crypto`, `buffer`, `stream`) under V8. Without the flag the deploy bundle fails to resolve `node:crypto`. The flag bloats the worker bundle modestly — acceptable trade-off; surgically removing every Node dep is a future refactor.

`account_id` is intentionally absent — it's injected at deploy time via `CLOUDFLARE_ACCOUNT_ID` env var (CI) or `wrangler login` (local). Keeps the file safe to commit on a public repo.

Observability is enabled from day one because dashboard logs are free and the first incident is cheaper to debug with them than without. Sentry / structured logging belongs to the observability epic (PR-C).

### Pool lifecycle refactor (Workers-driven)

On Workers, WebSocket connections cannot outlive a request — the runtime terminates idle sockets between invocations. A module-scope `Pool` instance would silently fail on the second request once its socket is reaped. The original `db/pool.ts` exported such a singleton.

Refactored to a factory:

```ts
export async function createPool(): Promise<{ db, end }> {
  await ensureWebSocketConstructor(); // polyfills `ws` on Node/Bun only
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return { db: drizzle(...), end: () => pool.end() };
}
```

Callers (`runSignupTransaction`, `runCreateSession`) acquire a fresh pool inside their function body and `await end()` in a `finally` block. Cost: ~50-150ms of WebSocket handshake per call. Acceptable because both flows are low-frequency (signup is once-per-user; createSession is once-per-workout).

`ensureAthlete` previously did a `SELECT` on the pool — switched to the HTTP `db` client (single statement, no transaction needed) to avoid the handshake on the hot login path.

### Better Auth version bump

`@better-auth/kysely-adapter@1.6.14` had a transitive bug: imported `DEFAULT_MIGRATION_LOCK_TABLE` from the root of `kysely`, but kysely 0.29 moved those constants to `kysely/migration`. Build failed on rolldown's static analysis (even though the dialect files are only loaded via conditional dynamic imports we never trigger). Better Auth 1.6.15 fixed the imports. Bumped on this branch.

### Deploy pipeline

`.github/workflows/deploy.yml` triggered on `push: branches: [main]`. Three sequential jobs:

1. **verify** — re-run lint + typecheck + unit tests inline. Defence-in-depth: the PR gate already ran them but a force-push could bypass. Cheap.
2. **migrate** — `bun run db:migrate` against the prod Neon branch. Runs BEFORE the worker is deployed so the schema is forward-compatible with the new code. New columns must be additive — destructive migrations only ship in a follow-up PR after the code that stopped using the old column has already been deployed.
3. **deploy** — `cloudflare/wrangler-action@v3` builds with `VITE_APP_URL` inlined into the client bundle and pipes the seven Worker Secrets through `wrangler secret put` before deploying. Action version pinned (not `@latest`) so a major bump is an explicit PR, not a silent deploy break.

### What is out of scope for this ADR

- **Staging environment.** Single env for now; `[env.staging]` blocks deferred until the third "merge broke prod" incident.
- **Preview deploys per PR.** `wrangler versions upload` enables this; not blocking, low value at 1 reviewer.
- **Custom domain.** `*.workers.dev` is sufficient — DNS/SSL come when there's a brand reason.
- **Allowlist enforcement, bot protection, security headers.** All belong to PR-B (security layer).
- **Sentry, `/api/health`, UptimeRobot, backups.** All belong to PR-C (observability).

## Alternatives considered

### Cloudflare Pages with Pages Functions

- **Pros:** UI-friendly, GitHub auto-deploy without a workflow file, easier secrets management UI.
- **Cons:** No documented TanStack Start adapter path; Pages is being subsumed into Workers + assets bindings; Pages Functions vs Workers split adds mental overhead.
- **Verdict:** Rejected. Workers is the strategic Cloudflare direction.

### Vercel

- **Pros:** Trivial deploy ergonomics; closest to the React stack's path of least resistance.
- **Cons:** Bandwidth and invocation pricing climbs with traffic; vendor lock-in for "edge" features; less learning value for a CV/portfolio piece.
- **Verdict:** Rejected. Cost trajectory and learning value both favour Cloudflare.

### Self-host (Fly.io, Hetzner VPS)

- **Pros:** Full Node runtime, no edge constraints, maximum infra learning.
- **Cons:** SSL, restarts, healthchecks, OS patching all on me. Wrong stage of project.
- **Verdict:** Rejected. Undifferentiated infra work for a solo MVP.

### `wrangler.toml` over `wrangler.jsonc`

- **Pros:** More examples in older docs/StackOverflow.
- **Cons:** No inline comments (forcing decision rationale into a sibling README); newer Wrangler config features are JSON-only.
- **Verdict:** Rejected. JSONC is the future-proof choice.

### Keep `dbPool` as a module-scope singleton

- **Pros:** Zero code change, ~100ms latency savings on subsequent requests.
- **Cons:** Silently broken on Workers — socket reaped between requests; would manifest as intermittent failures only in production, hardest possible bug to diagnose.
- **Verdict:** Rejected. Correctness wins.

### Bypass Better Auth update by stubbing kysely-adapter SQLite dialects

- **Pros:** Keeps Better Auth pinned at 1.6.14.
- **Cons:** Vite resolve.alias hack on a transitive dep; tech debt that bites the next time something else breaks.
- **Verdict:** Rejected. Minor version bump on a maintained library is cleaner.

## Consequences

### Positive

- "Merge to main = deployed to production" is one PR away from real.
- Pool refactor closes a latent bug class — module-scope DB clients that don't survive Workers' request boundary.
- Observability dashboard logs available from minute one — no waiting on a separate observability PR to be able to debug.
- ADR-0007's hosting decision is now an actual deploy.

### Negative / trade-offs

- ~100-300ms of latency added to the `createSession` and signup paths (per-request pool acquisition). Measurable but not user-visible; if it ever becomes user-visible we have a `WITH ... INSERT` CTE rewrite ready to fall back to.
- `nodejs_compat` adds ~50-100kb to the worker bundle (estimated). Inside the free-tier 3MB limit comfortably.
- No staging means the only safety net between a bad PR and prod is the CI gate. Acceptable at this scale; revisit at first incident.
- `VITE_APP_URL` is inlined into the client bundle at build time — if the GitHub secret is wrong, prod is broken until a redeploy. Smoke test in the runbook checks for this explicitly.

### Follow-ups

- **PR-B (security):** allowlist enforcement before sharing the URL beyond two testers.
- **PR-C (observability):** Sentry + health endpoint + backups + rollback runbook.
- **Future:** staging environment when justified; custom domain when there's a brand reason; preview deploys when more reviewers join.

## References

- [ADR-0007: Cloudflare Pages + Workers](ADR-0007-cloudflare-pages-workers.md) — original hosting decision
- [ADR-0003: Postgres + Neon + Drizzle](ADR-0003-postgres-neon-drizzle.md) — driver choices that PR-A inherits
- [docs/learning/deploy-and-environments.md](../learning/deploy-and-environments.md) — concept-level walkthrough
- [docs/runbooks/deploy.md](../runbooks/deploy.md) — operational procedures
