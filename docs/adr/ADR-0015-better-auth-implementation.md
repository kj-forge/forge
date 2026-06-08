# ADR-0015: Better Auth implementation — schema, hooks, atomicity

- **Status:** Accepted
- **Date:** 2026-06-07
- **Deciders:** @kj-ninja
- **Linear:** [FRG-7](https://linear.app/kj-forge/issue/FRG-7)

## Context

[ADR-0004](ADR-0004-better-auth-strategy.md) chose Better Auth strategically. This ADR captures the *implementation* decisions that landed in the auth epic: how the schema is shaped, how we map our table names to Better Auth's defaults, how signup side-effects (athlete + public profile + audit log) are made atomic, how the magic-link delivery integrates with Resend, and the residual risks we're accepting for now.

Constraints in scope:
- Our schema already has `users` (plural) from the data-model epic; Better Auth defaults are singular (`user`).
- Our `sessions` table is training sessions, not auth sessions — name collision.
- Drizzle's `neon-http` driver, our default DB client, does NOT support multi-statement transactions (every HTTP request is one statement).
- The athletes table is a hard requirement for almost every other domain feature — a user without an athlete row is broken.
- Public repo; no operational secrets in code.

## Decision

Adopt Better Auth (v1.6.x) with these implementation choices:

1. **Table prefix:** auth tables are `auth_session`, `auth_account`, `auth_verification` (DB) / `authSessions`, `authAccounts`, `authVerifications` (TS) — prefixed to avoid colliding with the training `sessions` table and to namespace clearly in DB inspection tools. `users` keeps its plural name.
2. **Schema mapping** at the Drizzle adapter:
   ```ts
   drizzleAdapter(db, {
     provider: "pg",
     schema: { user: users, session: authSessions, account: authAccounts, verification: authVerifications },
   })
   ```
3. **Postgres-minted UUIDs** via `advanced.database.generateId: false`. Better Auth otherwise generates cuid2 strings, which a `uuid` column rejects.
4. **Atomic signup side-effects** via a dedicated WebSocket-pool Drizzle client (`db/pool.ts`). The signup hook calls `runSignupTransaction(...)` which wraps `athletes`, `athlete_public_profiles`, and `audit_log` inserts in one `dbPool.transaction(...)`. Partial state is impossible.
5. **Username generation** is random readable (`brave-otter-471` — adjective + animal + 3-digit number). On a unique-violation we retry up to 5 times within the same transaction. Users can rename later via profile flow.
6. **Audit log scope (minimal):** USER_SIGNUP only. Sign-in success, sign-out, password reset, account linking etc. land later with the observability epic.
7. **`ensureAthlete()` recovery helper** — idempotent backfill that creates the athlete + profile + audit_log if a user row exists without an athlete. Defence-in-depth for backup restores, manual DB edits, or hook failures that the transaction itself can't protect against (e.g. RPC dies mid-call after Better Auth's user.create commits).
8. **Magic-link plugin** uses Resend SDK from the `sendMagicLink` callback. Token expiry left at the 5-minute default. Token storage stays at Better Auth's default `"hashed"` strategy.
9. **`tanstackStartCookies()` plugin is the last entry** in the plugins array. It wraps cookie-emitting endpoints to use TanStack Start's response pipeline; anything after it would shadow that behavior.
10. **API surface** is a single catch-all server route at `src/routes/api/auth/$.ts` that forwards GET and POST to `auth.handler(request)`.
11. **Protected routes** use TanStack Router's `beforeLoad` to call `getSession()` and `throw redirect({ to: "/login" })` on miss. No middleware layer.

## Alternatives considered

### Alternative A — Drop the `auth_` prefix and use Better Auth's singular defaults (`session`, `account`, `verification`)

- Pros: zero schema mapping needed; matches Better Auth ecosystem examples.
- Cons: `session` would collide with our training `sessions` (singular vs plural in the same schema is a footgun); confusing in DB inspection tools.

### Alternative B — Compensation pattern (delete the user row if athlete insert fails)

- Pros: atomic at the user-level without needing transactions.
- Cons: Better Auth already returned the user to the caller and set Set-Cookie before our hook runs; deleting the user leaves the client with a cookie pointing at a dead session. UX confusing, debugging hard. Rejected.

### Alternative C — `ensureAthlete()` alone, no transaction (best-effort hook + self-heal)

- Pros: simplest code path; no WebSocket pool needed.
- Cons: every `getSession()` would carry a backfill check; orphan state would persist until the next login; user sees a half-broken UI in the gap. The transaction is the primary defence; ensureAthlete is a *second* layer for outside-of-flow edge cases.

### Alternative D — Switch the entire default DB client to WebSocket pool

- Pros: every query is transaction-capable.
- Cons: HTTP driver is faster (no WebSocket handshake) and Workers-native; we only need transactions in a few places. Two clients (HTTP default, pooled for atomicity) is the right specialization.

## Consequences

### Positive

- Signup is provably atomic: athlete + public profile + audit log either all exist or none do. The next domain epic (strength training) can read `athletes` freely without orphan-handling code on every read.
- Schema mapping is explicit and reviewable: one block in `src/lib/auth.ts` says "this is how Better Auth's model names align with our schema."
- Username retry is bounded (5 attempts) and surfaces a clear error if every attempt collides. The 729M-combination space makes 5 attempts more than enough in practice.
- Hot path stays fast: the HTTP driver handles every normal request; the WebSocket pool is only opened during signup (~once per user lifetime). Latency cost is invisible.
- `ensureAthlete()` makes the system tolerant of operational mishaps without changing the happy-path code.

### Negative / trade-offs

- Two Drizzle clients to keep in sync (HTTP `db` + pooled `dbPool`). A future contributor could write a multi-step write against `db` and silently lose atomicity. Mitigated by ADR documentation and a follow-up to add a code-review checklist item.
- OAuth tokens (access / refresh / id) stored in plaintext in `auth_account`. Better Auth's default; a DB compromise (or backup leak) hands a long-lived bearer credential to the attacker. Mitigation roadmap: minimize requested scopes (we only ask `email/profile/openid`), avoid offline access, and add application-layer AES-GCM encryption if scope ever broadens.
- `audit_log.action` is free-text rather than an enum — easy to typo `"USER_SIGNUP"` vs `"user_signup"`. A follow-up will add a constants module to centralize action strings; not blocking.
- The smoke test still requires a real email round-trip (Resend dev mode only delivers to the Resend-account email). Documented in `docs/learning/auth-concepts.md` and `docs/learning/curl-basics.md`.
- We are NOT publishing the Google OAuth consent screen during dev — only the test-user list works. Documented.
- PII in `auth_session.ipAddress` / `auth_session.userAgent` and `audit_log.ip` / `audit_log.userAgent` has no automated retention pruning yet. GDPR-aware follow-up.

### Follow-ups

- **Integration test suite** with Testcontainers + Postgres — covers atomic transaction rollback, happy-path signup, username collision retry, ensureAthlete idempotency, Resend mock. Tracked as a sub-issue under this epic.
- **Adversarial Workflow review** (4 reviewers — security defaults, Better Auth API correctness, transaction safety, monetization integration). Deferred to the same sub-issue.
- **OAuth token encryption-at-rest** — application-layer AES-GCM before insert; revisit once we add a scope beyond `email/profile/openid` or ship multi-user.
- **PII retention pruning job** — scheduled Cloudflare cron to delete `auth_session.ipAddress`, `auth_session.userAgent`, and `audit_log.ip` older than the configured horizon. Folded into the observability epic.
- **Audit log action constants** — `src/lib/audit-actions.ts` enum-style export to prevent string typos. Folded into the next epic that needs to write another `audit_log` row.
- **Domain verification in Resend** + **publish app in Google OAuth** — required for production launch. Separate launch-prep epic.
- **`auth_verification` cleanup** — Better Auth deletes on consume, but abandoned attempts leave residue; small scheduled cleanup job (folded into observability epic).

## References

- [ADR-0004](ADR-0004-better-auth-strategy.md) — strategic choice of Better Auth (this ADR is implementation-specific follow-up)
- [ADR-0010](ADR-0010-multi-tenant-schema.md) — multi-tenant invariant; auth tables are exempt (per-user, not per-athlete)
- [ADR-0012](ADR-0012-drizzle-conventions.md) — UUID PKs, timestamptz, named indexes, snake_case casing
- [ADR-0013](ADR-0013-monetization-ready-schema.md) — `audit_log` table is defined here; signup hook is the first writer
- [ADR-0014](ADR-0014-observability-and-llm-gateway.md) — observability stack that will own PII retention + audit log expansion
- `docs/learning/auth-concepts.md` — concept-level walkthrough for picking this up
- `docs/learning/curl-basics.md` — smoke-test walkthrough using curl
- Better Auth docs: https://www.better-auth.com/docs
