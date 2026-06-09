# Deploy runbook

Operational procedures for running Forge in production on Cloudflare Workers. Concept-level background lives in [`docs/learning/deploy-and-environments.md`](../learning/deploy-and-environments.md) — read that first if any of the commands below don't make sense.

This runbook covers four things:

1. **First-time setup** (one-time, done once per environment).
2. **Routine deploy** (every push to `production`).
3. **Manual deploy / rollback** (when CI is unavailable or a fast rollback is needed).
4. **Smoke test** (post-deploy verification).

Plus a troubleshooting appendix for the failure modes we've actually seen or actively anticipate.

---

## 1. First-time setup

Run these once per fresh Cloudflare account / Neon project. None of them need to be re-run on subsequent deploys.

### 1.1 Cloudflare account + API token

1. Sign up at https://dash.cloudflare.com (free tier).
2. Note the **Account ID** from the dashboard right sidebar.
3. Workers & Pages → Overview → choose a workers.dev subdomain (e.g. `forge-app`). This appears in the URL as `<worker-name>.<subdomain>.workers.dev`. **Hard to change once shared** — pick something durable.
4. My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template. Scope: `Account: Workers Scripts: Edit`, `Account: Account Settings: Read`. Save the value (shown ONCE).

### 1.2 Neon production branch

1. Neon console → Forge project → Branches → Create branch.
2. Name: `production`. Parent: `main` (the dev branch).
3. Copy the **pooled** connection string (host contains `-pooler`). Pooled is what serverless wants.
4. (Optional, recommended for the first deploy) Apply migrations locally to the prod branch to verify they don't error:

```sh
DATABASE_URL='<prod-pooled-url>' bun run db:migrate
```

5. Store the connection string in a password manager.

### 1.3 Better Auth secret (fresh for prod)

```sh
openssl rand -base64 32
```

**Do not reuse** the dev `BETTER_AUTH_SECRET`. Rotating dev should not log prod users out. Save in the password manager.

### 1.4 Google OAuth production redirect URI

Google Cloud Console → APIs & Services → Credentials → existing Forge OAuth client → Authorized redirect URIs → **Add**:

```
https://<worker-name>.<subdomain>.workers.dev/api/auth/callback/google
```

Do NOT remove the localhost entry — dev still needs it.

Also: Authorized JavaScript origins → Add `https://<worker-name>.<subdomain>.workers.dev`.

If the OAuth consent screen is in Testing mode, add tester emails as Test users so they can sign in.

### 1.5 Resend

Either:
- Keep using `onboarding@resend.dev` (Resend's shared sender; only delivers to the account-owner's email). Fine for solo testing.
- Verify a sending domain in Resend dashboard. Adds DNS work (SPF/DKIM); enables sending to any address.

For the 3-5 tester window, the first option is sufficient. Note the limit in the smoke test.

### 1.6 GitHub repo secrets

Settings → Secrets and variables → Actions → New repository secret. Add each:

| Secret | Source |
|---|---|
| `CLOUDFLARE_API_TOKEN` | from 1.1 |
| `CLOUDFLARE_ACCOUNT_ID` | from 1.1 |
| `DATABASE_URL` | from 1.2 (prod pooled URL) |
| `BETTER_AUTH_SECRET` | from 1.3 |
| `VITE_APP_URL` | `https://<worker-name>.<subdomain>.workers.dev` |
| `RESEND_API_KEY` | from Resend dashboard |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` (or your verified sender) |
| `GOOGLE_CLIENT_ID` | from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |

All nine must be set before the first deploy succeeds. Missing any one = the deploy step fails (clearly, in the logs).

### 1.7 Create the `production` branch (one-time)

Forge uses a promote-to-prod branching model: `main` is the integration branch (where PRs merge, CI runs but no deploy fires), `production` is the prod branch (push to it = deploy). Before the first deploy, the `production` branch has to exist.

After the deploy-foundation PR merges to `main`:

```sh
git checkout main
git pull origin main
git checkout -b production
git push -u origin production    # this is the FIRST deploy trigger
```

After that, future deploys are:

```sh
git push origin main:production  # fast-forward production to current main
```

Or open a PR `main → production` in the GitHub UI and merge it — same effect.

### 1.8 First deploy (manual seeding optional)

The GitHub Actions workflow assumes Workers Secrets exist. The first push to `production` will create them via `cloudflare/wrangler-action@v3`'s `secrets:` mechanism — no separate seeding step needed.

If you ever need to seed manually (e.g., to test before promoting):

```sh
bunx wrangler login                          # one-time browser auth
bunx wrangler secret put DATABASE_URL        # interactive — paste the value
bunx wrangler secret put BETTER_AUTH_SECRET
# ... repeat for each secret in the table above
```

`wrangler whoami` confirms you're authenticated as the right account.

---

## 2. Routine deploy

### Trigger

Push to the `production` branch — NOT merges to `main`. The GitHub Actions workflow `.github/workflows/deploy.yml` is wired to `branches: [production]` only.

Two ways to promote `main` to `production`:

```sh
# Option A — fast-forward push from the command line
git checkout main && git pull
git push origin main:production
```

```sh
# Option B — PR in the GitHub UI
# Open: https://github.com/kj-forge/forge/compare/production...main
# Click "Create pull request" → review → merge.
```

Option B gives a diff-review step; option A is a single command. Either way, the push to `production` is what fires the deploy.

### What happens

Three sequential jobs:

1. **verify** — `bun install` + `bun run build` + lint + typecheck + unit tests. Fails fast on regressions that slipped past the PR gate.
2. **migrate** — `bun run db:migrate` against the Neon production branch. Migrations applied before code deploys.
3. **deploy** — `bun run build` (with `VITE_APP_URL` inlined) + `cloudflare/wrangler-action@v3` which syncs Workers Secrets and runs `wrangler deploy`.

### Expected duration

3-5 minutes end-to-end.

### How to watch

GitHub repo → Actions tab → most recent "Deploy" run. Each job has live logs. The deploy step prints the worker URL at the end.

### What if a step fails

- **verify fails** → fix on `main` (PR + merge), re-promote to `production`. Nothing was deployed; production unchanged.
- **migrate fails** → the migration has a bug. Production schema unchanged; worker unchanged. Read the SQL error, fix on `main`, re-promote.
- **deploy fails** → the migration ran (schema is now ahead of code). Investigate:
  - If recoverable: fix on `main`, re-promote to `production`. Migration step is idempotent (Drizzle skips already-applied migrations).
  - If unrecoverable: the previous worker is still serving. The schema mismatch is benign IF the migration was additive (it should always be — see [learning doc §7](../learning/deploy-and-environments.md#7-migrations-in-production)). If the migration was destructive and the old code needs the dropped column, you have a real problem — see §3.2 below.

---

## 3. Manual deploy and rollback

### 3.1 Manual deploy (when CI is broken)

From a clean checkout of `production` (or `main` if you trust HEAD):

```sh
bun install --frozen-lockfile
bun run db:migrate         # uses your local DATABASE_URL — set it to the prod string
VITE_APP_URL=<prod-url> bun run build
bunx wrangler deploy        # uses your `wrangler login` session
```

If secrets need updating:

```sh
bunx wrangler secret put NAME    # interactive paste
```

Never commit secrets. Never put them in `wrangler.jsonc`.

### 3.2 Rollback

Two flavors:

**Worker rollback (code only, no schema change).** Cloudflare retains the previous 10 deployments. From the dashboard:

1. Workers & Pages → forge → Deployments tab.
2. Find the last known-good deployment.
3. Click "Rollback to this version."

Propagation is ~30 seconds globally. Old code starts serving traffic. The DB schema is unaffected.

This is the right move if a deploy introduces a bug but the schema is fine.

**Schema rollback (rare, hard).** If you shipped a destructive migration and need to undo it:

- If you have Neon point-in-time recovery (free tier: ~24h retention), restore the prod branch to a point before the migration ran. Neon console → branches → restore.
- If older than 24h: you need a backup. Without backups configured (PR-C territory), this is data loss.
- After restoring schema: redeploy the previous worker version (which expects the old schema).

This is why destructive migrations should ALWAYS ship in a follow-up PR after the code that stopped using the column has been deployed. The [learning doc §7](../learning/deploy-and-environments.md#7-migrations-in-production) covers expand-then-contract.

### 3.3 Worker version pinning / lockdown

If you suspect a CI compromise or want to freeze prod while investigating something, lock deploys at the dashboard: Workers & Pages → forge → Deployments → Lock current version. New deploys will fail until unlocked.

---

## 4. Smoke test (post-deploy verification)

Run this every time you push a deploy that touches infrastructure, auth, or DB. Optional for pure UI tweaks.

Estimated time: 3-5 minutes on a phone.

**Pre-flight checks:**

- [ ] `wrangler tail` running in a terminal (catches errors live).
- [ ] Your prod URL handy: `https://<worker>.<subdomain>.workers.dev`.

**The flow:**

1. **Cold load.** Visit the URL in a fresh browser session (incognito works). Landing page renders. No console errors. Status check: 200 from `/`.
2. **Magic link.** Click sign-in → enter your allowlisted email → "Sprawdź email" page appears. Inbox: message arrives within ~30 seconds (check spam first time). **The link inside MUST point to the prod URL, not localhost.** If it points to localhost, `VITE_APP_URL` secret is wrong or wasn't inlined at build time — see §5.1 below.
3. **Magic link redemption.** Click the link. Session cookie sets. Redirected to home. You're signed in.
4. **Google OAuth.** Sign out. Sign in with Google. Round-trip succeeds. (If Google rejects the redirect URI: the prod URI wasn't added — see §1.4.)
5. **Strength session create.** Tap "Rozpocznij nową sesję" → "Pusta sesja" → add an exercise. The drawer opens cleanly, can log a set. This exercises the `runCreateSession` flow which uses the WebSocket pool — the most likely thing to break under Workers.
6. **Read-back.** Reload the page. The session and set you just logged are still there. (Exercises the HTTP `db` read path.)
7. **Sign out.** Cookie clears. Returned to login.

If all seven pass, the deploy is healthy. Stop `wrangler tail` and you're done.

If any fail, troubleshoot via §5 below or the Cloudflare dashboard logs (observability is enabled).

---

## 5. Troubleshooting appendix

### 5.1 Magic link contains `localhost`

**Symptom:** smoke test step 2 — the link in the email points to `http://localhost:3000/...`.

**Cause:** the GitHub `VITE_APP_URL` secret is unset or wrong; the build inlined the wrong value into the client bundle, and Better Auth then constructed the magic link URL from that.

**Fix:**

1. GitHub → Settings → Secrets → check `VITE_APP_URL` matches the actual workers.dev URL exactly (no trailing slash, scheme `https://`).
2. Re-run the deploy workflow (Actions → most recent Deploy → Re-run all jobs) so the secret propagates into a fresh build.

### 5.2 Build error: "DEFAULT_MIGRATION_LOCK_TABLE is not exported by kysely"

**Symptom:** verify or deploy job fails at the `bun run build` step with this error from `@better-auth/kysely-adapter`.

**Cause:** Better Auth version is pinned older than 1.6.15 (kysely-adapter has a transitive import bug fixed in 1.6.15).

**Fix:** `bun update better-auth` to ≥ 1.6.15, commit the lock change.

### 5.3 Worker deploys but auth flow throws "Could not resolve 'node:crypto'"

**Symptom:** OAuth round-trip or magic link verify throws this in the Cloudflare dashboard logs.

**Cause:** `compatibility_flags: ["nodejs_compat"]` is missing from `wrangler.jsonc`.

**Fix:** add the flag, commit, redeploy.

### 5.4 `createSession` randomly fails with "WebSocket connection lost"

**Symptom:** intermittent failures when starting a new strength session. First request might succeed, subsequent calls fail.

**Cause:** somebody reverted the `db/pool.ts` factory refactor back to a module-scope `Pool` singleton. Workers reaped the socket between requests.

**Fix:** confirm `db/pool.ts` exports `createPool` (factory) NOT `dbPool` (singleton). All callers must call `createPool()` inside their handler and `end()` in a finally block. See [learning doc §5](../learning/deploy-and-environments.md#5-the-database-driver-story-under-workers).

### 5.5 Migration step succeeds but worker still serves old schema-aware code

**Symptom:** new column exists in Neon (verified via `db:studio` or psql), but the deployed worker still queries the old column shape.

**Cause:** the deploy step ran before the migration step finished, OR a previous deploy didn't complete cleanly.

**Fix:** check Actions → Deploy run → confirm `migrate` job ran successfully before `deploy` job started. If yes but worker is stale: invalidate the Cloudflare cache (dashboard → caching → purge everything) and retry.

### 5.6 Wrangler deploy fails with "Authentication error"

**Symptom:** `cloudflare/wrangler-action@v3` step fails immediately with a 401 from the Cloudflare API.

**Cause:** `CLOUDFLARE_API_TOKEN` is missing, expired, or scoped wrong.

**Fix:** regenerate the token (see §1.1), update the GitHub secret, re-run deploy.

### 5.7 Resend silently drops magic link emails

**Symptom:** smoke test step 2 — no email arrives (not even in spam).

**Cause:** sending from a non-verified domain OR sending TO an address other than the Resend account owner's (when using `onboarding@resend.dev`).

**Fix:**

- Short term: verify the recipient address matches the Resend account email.
- Long term: verify a domain in Resend (DNS work: TXT, MX, DKIM, DMARC) and update `RESEND_FROM_EMAIL` to `<something>@<your-domain>`.

### 5.8 Worker bundle exceeds size limit

**Symptom:** `wrangler deploy` fails with "Worker exceeded the size limit".

**Cause:** new dependency or large asset accidentally bundled into the worker.

**Fix:**

- Check `dist/server/index.js` size and `dist/server/assets/` for unexpected large files.
- Common culprits: importing a UI library into a server file, accidentally bundling test fixtures.
- Move imports to client-only or extract heavy logic out of the server fn path.

---

## 6. Secret rotation

Rotate any secret periodically — quarterly minimum, immediately if you suspect leakage.

### Rotate `BETTER_AUTH_SECRET`

1. Generate a fresh value: `openssl rand -base64 32`.
2. Update GitHub repo secret `BETTER_AUTH_SECRET`.
3. Re-run deploy workflow.
4. **Side effect:** all existing sessions invalidate. Every user re-authenticates. Communicate before doing this.

### Rotate `DATABASE_URL`

Neon → branches → settings → reset connection string. New URL.
1. Update GitHub repo secret `DATABASE_URL`.
2. Re-run deploy workflow.
3. **Side effect:** none beyond a brief deploy cycle.

### Rotate `RESEND_API_KEY` / `GOOGLE_CLIENT_SECRET`

Same shape — issue new credential in the provider's dashboard, update GitHub secret, re-run deploy. OAuth client secrets require the user-side OAuth flow to re-prompt; magic link is unaffected.

### Rotate `CLOUDFLARE_API_TOKEN`

API Tokens → existing token → Roll. Update GitHub secret. Re-run deploy. Old token revokes immediately.

---

## 7. When to update this runbook

- **Always:** when a step here fails in a way it shouldn't, document the fix in §5.
- **Always:** when adding a new secret (new env var = new entry in §1.6 + §6).
- **Always:** when changing the deploy pipeline structure.
- **Never:** for one-off incidents — those go in a separate `docs/runbooks/incidents/` once we have any.

The bar: a future-you (or a future-collaborator) should be able to recover production from this document alone, without re-deriving anything from the codebase or the ADRs.
