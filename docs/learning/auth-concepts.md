# Auth concepts — for someone strong on frontend

A walkthrough of the auth pieces that live in Forge: what a session is, what a cookie does, why Better Auth needs four tables, how magic links differ from password resets, what OAuth actually does, and the dev-mode gotchas that frustrate everyone the first time. Each section gives the frontend analogy first, then the Forge specifics.

> The companion is [`docs/learning/curl-basics.md`](curl-basics.md) which uses these concepts in a smoke-test walkthrough.

## 1. Session vs token vs JWT

**Frontend analogy.** Think of "logged in" state as a `useState` value. The question is *where* the source-of-truth lives and *how* the browser proves it on every request.

Three common shapes:

| Shape | Source of truth | How browser proves identity | Revocation |
|---|---|---|---|
| **Stateful session** | DB row | Opaque token in cookie → server looks up the row | Delete the row |
| **JWT (stateless)** | Token itself (signed claims) | Token in `Authorization: Bearer` or cookie | Wait for expiry, or maintain a blocklist |
| **Hybrid (refresh + access)** | Refresh in DB, access JWT | Access JWT short-lived, refresh long-lived | Revoke refresh token |

**Forge uses stateful sessions** (Better Auth default). Reasons:
- Revocable instantly ("log out everywhere" actually works)
- Easy to inspect ("which sessions does this user have, on which devices?")
- Postgres is fast — looking up `auth_session` by token is one indexed query

The cookie holds an **opaque token** (random hex), not a JWT. The server hashes the token and looks it up in `auth_session` on every request.

## 2. What a cookie actually is

**Frontend analogy.** `localStorage` for the server. You can read and write it via JS, BUT well-behaved auth never does that — it sets cookies with flags that make them invisible to JS.

A session cookie looks like:
```
Set-Cookie: better-auth.session_token=abcd...wxyz;
            HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800
```

What each flag means:
- **`HttpOnly`** — JS can't read it (`document.cookie` returns empty). Defends against XSS.
- **`Secure`** — only sent over HTTPS (in production; localhost gets a pass).
- **`SameSite=Lax`** — sent on top-level navigation but not on cross-site `fetch` from evil-site.com. Defends against CSRF for most cases.
- **`Path=/`** — sent on every request to our domain.
- **`Max-Age=604800`** — 7 days, in seconds.

Every fetch from the browser to `forge.app/*` automatically attaches this header. The server reads it, looks up the session row, and now knows who you are. No "auth token in header" plumbing required.

## 3. Why Better Auth needs four tables

Forge schema introduces:

| Table | What's in it | Why |
|---|---|---|
| `users` | id, email, name, image, emailVerified | The "you", once per real person. |
| `auth_session` | id, userId, token, expiresAt, ipAddress, userAgent | One row per active browser. Token in cookie. |
| `auth_account` | id, userId, providerId, accountId, accessToken, refreshToken, ... | One row per (user, identity provider) pair. Magic link is one row (provider = "credential"). Google is another. |
| `auth_verification` | id, identifier, value (hashed), expiresAt | Short-lived rows: magic-link tokens, email-change tokens, etc. Deleted on consume. |

The `users` ↔ `auth_account` distinction is important. **One user can have many accounts** — sign up via magic link with `alice@example.com`, later add Google OAuth to the same email: one user row, two account rows linking different providers.

We extended `users` with two columns Better Auth needs: `emailVerified` and `image`.

## 4. The magic-link flow, step by step

What happens when you type your email into `/login` and hit submit:

1. Browser → `POST /api/auth/sign-in/magic-link` with `{ email }`.
2. Better Auth generates a 32-byte random token.
3. Better Auth hashes the token (SHA-256) and inserts the **hash** into `auth_verification` with `expires_at = now() + 5 minutes` and `identifier = email`.
4. Better Auth invokes our `sendMagicLink({ email, url, token })` callback (`src/lib/auth.ts`). The callback wraps Resend's SDK and sends a Polish email with the URL `https://forge.app/api/auth/magic-link/verify?token=...` (in dev: `http://localhost:3000/...`).
5. Response 200 `{"status":true}` flies back to the browser. The token does NOT appear in the response — it's only in the email.
6. User opens the email, clicks the link, browser does `GET /api/auth/magic-link/verify?token=...`.
7. Better Auth hashes the incoming token and looks for a matching `auth_verification` row that hasn't expired.
8. Match found → Better Auth:
   - Deletes the verification row (one-time use).
   - Creates a `users` row if email is new, or fetches the existing one.
   - Runs `databaseHooks.user.create.after` (our signup hook — see next section).
   - Creates an `auth_session` row with a fresh opaque token.
   - Creates an `auth_account` row with providerId `"credential"`.
   - Sets the session cookie.
   - Redirects to the `callbackURL` (we pass `/me`).

**Why the hash, not the raw token?** Because the token in the DB doubles as a bearer credential — if anyone could read `auth_verification.value`, they could complete sign-in as that user. Hash means even DB compromise doesn't grant immediate impersonation. The Better Auth default is hashed; we kept it.

## 5. The OAuth flow (Google), step by step

OAuth is more dance, less mystery once you see it:

1. User clicks "Kontynuuj przez Google" → browser navigates to `/api/auth/sign-in/social/google`.
2. Better Auth redirects to Google's authorization URL with our `client_id`, the scopes we want (`email profile openid`), and a state token (CSRF defence).
3. Google shows the consent screen (which Forge configured in Google Cloud Console). User clicks "Allow."
4. Google redirects back to our `Authorized redirect URI`: `http://localhost:3000/api/auth/callback/google?code=<auth_code>&state=<state>`.
5. Better Auth verifies the state matches, then exchanges the `code` for tokens by calling `https://oauth2.googleapis.com/token` server-to-server with `client_secret`.
6. Google returns `{ access_token, refresh_token?, id_token, ... }`.
7. Better Auth verifies the `id_token` signature (Google's public keys) — this proves Google identified the user, not someone forging tokens.
8. Better Auth reads `email`, `name`, `picture` from the `id_token` claims.
9. Creates a `users` row if email is new (same hook fires); creates an `auth_account` row with `providerId = "google"`, `accountId = google_user_id`, and the OAuth tokens.
10. Creates `auth_session` + cookie + redirect, same as the magic-link tail.

**Why two flows for one outcome?** Magic link works without a password and without users having a Google account; Google OAuth is faster for users who do.

## 6. The signup hook (why athlete + audit_log + public_profile?)

Better Auth's `users` row only knows: who has an email and is verified. It does not know anything about Forge's domain (athletes, training, monetization).

Our `databaseHooks.user.create.after` fires once per first sign-in for a brand-new email. It calls `runSignupTransaction` (`src/lib/auth-signup.ts`) which atomically:

- Inserts an `athletes` row (with random username `brave-otter-471`, locale `pl`, timezone `Europe/Warsaw`).
- Inserts an `athlete_public_profiles` row (private by default — `isPublic: false`).
- Inserts an `audit_log` row with `action = "USER_SIGNUP"` so we have a trail for compliance.

These three rows must all exist or none must exist — otherwise we'd have a "ghost user" with no athlete row, and every other feature would fail with foreign-key errors. See [ADR-0015](../adr/ADR-0015-better-auth-implementation.md) for the atomicity story.

## 7. Atomicity — why the WebSocket pool

Drizzle has two ways to talk to Neon:

| Driver | Transport | Multi-statement transactions |
|---|---|---|
| `neon-http` (default `db`) | HTTP fetch per query | ❌ One statement per request |
| `neon-serverless` + `Pool` (`dbPool`) | WebSocket | ✅ Yes |

Three inserts that must succeed together → impossible over HTTP. So `db/pool.ts` configures a WebSocket pool client we use only inside `runSignupTransaction`. Trade-off: ~50 ms of WS handshake on first signup per process. Acceptable for a once-per-user flow.

The Postgres `BEGIN ... COMMIT` block guarantees: either all three rows write, or none. If `audit_log` insert fails (say, due to a unique-constraint surprise), Postgres rolls back the `athletes` and `athlete_public_profiles` inserts automatically. We get an error back, the user is left with only the Better Auth-created `users` row, and the next login (or the protected route's `beforeLoad`) triggers `ensureAthlete()` to backfill.

## 8. `ensureAthlete()` — defence in depth

`ensureAthlete(userId)` is idempotent: if an `athletes` row already exists for the user, no-op. If it doesn't, run the same transaction the signup hook would have run.

It exists because:
- Network blips between Better Auth's user.create commit and our hook's transaction can leave the user without an athlete.
- Future restore-from-backup, manual SQL edits, or hook-bypassing flows (admin-created users) all produce the same orphan state.

It's not on the hot path. We call it explicitly on first protected-route hit (Phase C UI doesn't need this yet, but it's there for the next epic).

## 9. The dev-mode gotchas (READ THESE)

These will frustrate you the first time. Documenting so they don't twice.

### Resend dev mode delivers to one email only

In Resend free tier without a verified domain, you send from `onboarding@resend.dev`. Resend's restriction: **that sender can only deliver to the email you used to sign up Resend**. The user uses `jakubiak.krzy@gmail.com` for Forge — that's the only address that gets actual delivery.

What happens with another email:
- `POST /api/auth/sign-in/magic-link` returns 200, status true.
- An `auth_verification` row appears in DB.
- Resend silently drops the email.
- User waits forever.

**Fix for production:** verify a domain in Resend (DNS records: SPF, DKIM). Then use `noreply@<your-domain>` and any recipient works.

### Google OAuth in dev only works for "Test users"

Google's consent screen has three modes:
- **Testing** — only emails on the Test users list can complete OAuth. Forge is here.
- **In production / Published** — anyone with a Google account can sign in.

User has `jakubiak.krzy@gmail.com` on the Test users list. Adding more emails: GCC → APIs & Services → OAuth consent screen → Audience → Test users → +Add users (max 100).

**Fix for production:** Publish the app. For the scopes we request (`email/profile/openid` — non-sensitive), Google approves instantly without review.

### Magic-link tokens are one-time and 5-minute expiry

If you click the link twice, the second click fails with "verification expired or already used" — by design. The verification row was deleted on the first click.

### Cookie must be served from the same domain as the auth handler

In dev both are `localhost:3000` (TanStack Start = one server). In production we'll deploy app and API together (Cloudflare Workers + Pages). If for some reason the frontend ran on a different origin, `VITE_APP_URL` and `BETTER_AUTH_URL` mismatches would cause cookies not to round-trip — that's why our env validation forces a single source.

## 10. Why protected routes use `beforeLoad`, not middleware

TanStack Router calls `beforeLoad` before rendering a route. We use it to:

```ts
beforeLoad: async () => {
  const session = await getSession()
  if (!session) throw redirect({ to: "/login" })
  return { session }
}
```

The thrown redirect happens **before** the component mounts — no flash of unauthenticated content, no client-side conditional rendering. Cleaner than the React-pattern "useEffect → router.push" because that fires after render.

The returned `{ session }` is available in the component via `Route.useRouteContext()` — type-safe, no separate fetch needed.

## 11. What's NOT in Forge auth yet

Deliberate omissions, tracked as follow-ups:

- **Password auth** — magic link is recovery. No `password` column populated; we keep the Better Auth-default nullable column on `auth_account` but never write to it.
- **2FA / passkeys** — Better Auth has plugins for both. Deferred until we have real users asking.
- **Multi-session UI** ("Your devices") — possible in Better Auth via the `multiSession` plugin; out of scope.
- **OAuth token encryption at rest** — Better Auth stores them plaintext. Acceptable while we only request non-sensitive scopes; revisit if we add `gmail.readonly` or similar.
- **Rate limiting** on `/api/auth/*` — Cloudflare Rate Limiting rule at edge; lands with the observability epic.
- **Sentry / PostHog wire-up** for auth events (sign-ins, sign-up funnel, abandoned magic links) — observability epic.
- **Email template customization** beyond the basic Polish HTML — React Email when we start caring about brand polish.

## 12. Where this fits next to other Forge docs

- **`docs/learning/database-concepts.md`** explains foreign keys, cascades, and constraints — those are what `auth_session.userId → users.id` actually means.
- **`docs/learning/database-workflow.md`** has the migration cheat sheet that landed `0001_better_auth_tables.sql`.
- **`docs/learning/curl-basics.md`** is the next read — it walks through hitting the API by hand.
- **`docs/adr/ADR-0004`** — strategic auth decision (why Better Auth).
- **`docs/adr/ADR-0015`** — implementation specifics for this PR.

## Quick reference

```ts
// Server-side: is there a session?
import { getSession } from "@/lib/session"
const session = await getSession() // { user, session } | null

// Server-side: protected route
beforeLoad: async () => {
  const s = await getSession()
  if (!s) throw redirect({ to: "/login" })
  return { session: s }
}

// Client-side: hooks
import { useSession, signIn, signOut } from "@/lib/auth-client"
const { data: session } = useSession() // reactive

// Send a magic link
await signIn.magicLink({ email, callbackURL: "/me" })

// Sign in with Google
await signIn.social({ provider: "google", callbackURL: "/me" })

// Sign out
await signOut()
```

```bash
# Smoke-test endpoint from a terminal (see curl-basics.md for the full walkthrough)
curl -i -X POST http://localhost:3000/api/auth/sign-in/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"jakubiak.krzy@gmail.com"}'
```
