# curl basics — for someone strong on frontend

A working knowledge of `curl` is table stakes for backend / full-stack work in 2026. This doc covers what it is, why every backend dev uses it, the flags you actually need, and walks through an end-to-end smoke test of Forge's auth as the practical example.

## 1. What curl is

**curl = Client for URLs.** A CLI program that sends HTTP requests (and many other protocols: FTP, SFTP, SMTP, WebSocket, ...) and prints the response. Open-source since 1996 by Daniel Stenberg, maintained as solo work for decades; Curl Inc. spun out in 2024 to fund continued maintenance.

Preinstalled on every macOS / Linux / modern Windows. Embedded in millions of devices (Tesla cars, IoT, robot vacuums, your router). Every backend dev uses it daily.

Sanity check it's installed:
```bash
curl --version
# curl 8.x.x (or 7.x — both fine)
```

## 2. Why know curl in 2026

| Use case | Why curl wins |
|---|---|
| Test an API endpoint without writing a script | One line vs. ten clicks in Postman |
| See what the server actually returns | No JS magic, no browser caching, no DevTools obscuring |
| Debug a deployed service over SSH | curl is the one thing always available |
| Follow along with anyone's README / API docs | Universal — every API doc shows `curl` examples |
| Compose with `jq`, `grep`, `awk` for one-shot scripts | Stdin/stdout makes it a Unix-pipeline native |
| Reverse-engineer someone else's API | Capture in DevTools → "Copy as cURL" → paste here |

## 3. Anatomy of a curl command

```
curl -i -X POST http://localhost:3000/api/auth/sign-in/magic-link \
     -H "Content-Type: application/json" \
     -d '{"email":"jakubiak.krzy@gmail.com"}'
```

What each piece is:

| Piece | Role |
|---|---|
| `curl` | The program |
| `-i` | Flag — include response headers in output |
| `-X POST` | Flag — HTTP method (default is GET) |
| `http://localhost:3000/api/auth/sign-in/magic-link` | The URL — where to send the request |
| `-H "Content-Type: application/json"` | Flag — set a request header (repeatable) |
| `-d '{"email":"..."}'` | Flag — request body |
| `\` at line end | Shell continuation — same line, just wrapped for readability |

## 4. The flags you actually use

| Flag | What it does | Example |
|---|---|---|
| `-X METHOD` | HTTP method override (default GET; auto-POST if `-d` present) | `-X DELETE`, `-X PUT`, `-X PATCH` |
| `-H "Header: Value"` | Add a request header; repeatable | `-H "Authorization: Bearer xyz"` |
| `-d 'body'` | Request body (string or `@file.json`) | `-d '{"key":"val"}'`, `-d @payload.json` |
| `--data-urlencode key=val` | URL-encode form data | `--data-urlencode "name=Krzysztof Jakubiak"` |
| `-i` | Print response headers + body | Quick check what server returned |
| `-I` | Print ONLY response headers (HEAD request) | Check if a URL exists / get content-length |
| `-v` | Verbose — show full request + response, including TLS | When something is mysteriously failing |
| `-L` | Follow redirects | Auth flows often redirect (302 to callback) |
| `-o file.bin` | Save body to file (binary downloads) | `-o image.png` |
| `-O` | Save body to filename derived from URL | `-O https://.../app.dmg` |
| `-s` | Silent — drop the progress bar | Pipe to `jq` etc.: `curl -s URL \| jq` |
| `-S` | Show errors even when silent | Pair with `-s` |
| `-u user:pass` | HTTP basic auth | `-u admin:secret` |
| `-b "name=val"` | Send a cookie | Session-based APIs |
| `-c file.txt` | Save received cookies to file (like a browser session) | Multi-step auth flows |
| `-b cookies.txt` | Use the cookie jar saved earlier | Pairs with `-c` |
| `-w "format"` | Print custom info after response | `-w "%{http_code}\n"`, `-w "%{time_total}\n"` |
| `--max-time 10` | Hard timeout in seconds | Prevent hung scripts |
| `-k` | Skip TLS cert verification (DANGEROUS) | Only for self-signed dev certs |

You can find all of them via `curl --help all` or `man curl` (every flag has been documented since the 90s; the manpage is solid).

## 5. curl vs alternatives

| Tool | Strength | Trade-off |
|---|---|---|
| **curl** | Universal, lingua franca of API examples | Verbose syntax for common cases |
| **httpie** (`http POST :3000/api`) | Human-readable, colored output | Has to be installed; not always available on prod boxes |
| **Postman / Insomnia / Bruno** | GUI, collections, env vars | Heavyweight; vendor lock-in; can't pipe |
| **VS Code REST Client** extension | Inline `.http` files in editor | Only inside VSCode |
| **`bun -e "fetch(...)"`** | Already in your toolchain | Verbose for one-off pings |

curl is the floor — knowing it means you can read any API docs and verify any endpoint anywhere. The rest are conveniences.

## 6. Practical example — smoke-test Forge auth

This walks the auth flow end-to-end using only curl. Use it once when you want to verify Phase B (atomic signup transaction) actually works in your local environment.

> The conceptual background — what each endpoint does, what the four auth tables hold — is in [`auth-concepts.md`](auth-concepts.md). This section is mechanics.

### 6.1 Open two terminals

**Terminal 1 — dev server.** Leave open; server logs land here, every error you'll need to debug shows up here.

```bash
cd ~/projects/forge
bun dev
```

You'll see Vite report `Local: http://localhost:3000`.

**Terminal 2 — test driver.** Where you run the curl commands and DB inspections.

### 6.2 Request a magic link

```bash
curl -i -X POST http://localhost:3000/api/auth/sign-in/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"jakubiak.krzy@gmail.com"}'
```

**Expected response:**
```
HTTP/1.1 200 OK
Content-Type: application/json
Set-Cookie: better-auth.session_data=...
Content-Length: 16

{"status":true}
```

**What happened server-side** (terminal 1 should show no errors):
- Better Auth generated a random 32-byte token.
- Hashed it (SHA-256) and inserted into `auth_verification` with `expires_at = now() + 5min`.
- Called our `sendMagicLink({ email, url, token })` callback in `src/lib/auth.ts`.
- Callback invoked Resend SDK; Resend returned 200; callback resolved.
- Better Auth returned `{ status: true }`.

**Likely failure modes:**
- `400` → bad JSON. Check the outer single quotes around `-d`.
- `404` → route not registered. Make sure `bun dev` is actually running and `src/routes/api/auth/$.ts` exists.
- `500` → bug in `sendMagicLink`. Most often: wrong `RESEND_API_KEY`. **Terminal 1 has the stack trace.**

### 6.3 Open Gmail

⚠️ **Resend dev-mode constraint**: from `onboarding@resend.dev`, Resend delivers ONLY to the email used to sign up Resend. Forge's signup email is `jakubiak.krzy@gmail.com`. Any other recipient gets silently dropped — request 200, no email ever arrives. (See [`auth-concepts.md` §9](auth-concepts.md) for the production fix: verify a domain.)

The email shows up within ~10 seconds:
- From: `onboarding@resend.dev`
- Subject: `Zaloguj się do Forge`
- Body: "Cześć! Kliknij poniższy link, aby zalogować się do Forge: [Zaloguj do Forge]"

### 6.4 Click the link in the email

The link is `http://localhost:3000/api/auth/magic-link/verify?token=<64-char-hex>`.

**What happens when your browser hits it:**
1. Better Auth hashes the incoming token, finds the matching `auth_verification` row.
2. Creates the `users` row (first sign-in on this email).
3. Fires `databaseHooks.user.create.after` → `runSignupTransaction` → atomic insert of `athletes` + `athlete_public_profiles` + `audit_log USER_SIGNUP` in a single Postgres TX over the WebSocket pool.
4. Creates `auth_session` and `auth_account` rows.
5. Set-Cookie with the session token.
6. 302 redirect → ends on `/me` (since `signIn.magicLink({ callbackURL: "/me" })` was the call).

You should land on the `/me` page showing your email and "Sesja wygasa: ...".

If you see an error message instead, **terminal 1 has the stack trace**. Copy/paste it and we'll debug.

### 6.5 Verify the database state

Back in terminal 2, run this read-only inspection script:

```bash
bun --env-file=.env -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

console.log('\\n=== USERS ===');
console.log(await sql\`SELECT id, email, email_verified, name, image FROM users ORDER BY created_at DESC LIMIT 1\`);

console.log('\\n=== ATHLETES ===');
console.log(await sql\`SELECT id, user_id, username, locale, timezone FROM athletes ORDER BY created_at DESC LIMIT 1\`);

console.log('\\n=== ATHLETE_PUBLIC_PROFILES ===');
console.log(await sql\`SELECT id, athlete_id, public_slug, is_public FROM athlete_public_profiles ORDER BY created_at DESC LIMIT 1\`);

console.log('\\n=== AUDIT_LOG ===');
console.log(await sql\`SELECT id, action, actor_user_id, entity_type, ip, user_agent FROM audit_log ORDER BY occurred_at DESC LIMIT 1\`);

console.log('\\n=== AUTH_SESSION ===');
console.log(await sql\`SELECT id, user_id, expires_at, ip_address, user_agent FROM auth_session ORDER BY created_at DESC LIMIT 1\`);

console.log('\\n=== AUTH_ACCOUNT ===');
console.log(await sql\`SELECT id, user_id, account_id, provider_id FROM auth_account ORDER BY created_at DESC LIMIT 1\`);
"
```

**Successful smoke test produces six rows that all link together**:

| Table | Key fields you should see |
|---|---|
| `users` | `email_verified: true`, `email: 'jakubiak.krzy@gmail.com'` |
| `athletes` | `user_id: <same uuid as users.id>`, `username: 'brave-otter-471'` (or similar), `locale: 'pl'`, `timezone: 'Europe/Warsaw'` |
| `athlete_public_profiles` | `athlete_id: <athletes.id>`, `public_slug` matches `username`, `is_public: false` |
| `audit_log` | `action: 'USER_SIGNUP'`, `actor_user_id: <users.id>`, `entity_type: 'users'` |
| `auth_session` | `user_id: <users.id>`, `expires_at` ~7 days out |
| `auth_account` | `user_id: <users.id>`, `account_id: 'jakubiak.krzy@gmail.com'`, `provider_id: 'credential'` |

The critical proof is that `user_id` is identical across all six rows — that's the atomic transaction in action.

### 6.6 (Optional) Verify the session helper directly

The `getSession()` server function reads the session cookie and looks up the row. We can exercise it with curl by extracting the cookie from your browser and replaying it.

1. In your browser at `http://localhost:3000`, open DevTools (Cmd-Opt-I).
2. Application → Cookies → `http://localhost:3000` → find `better-auth.session_token` → copy its **value** (long string).
3. In terminal 2:

```bash
curl -i http://localhost:3000/api/auth/get-session \
  -H "Cookie: better-auth.session_token=PASTE_VALUE_HERE"
```

Expected:
```
HTTP/1.1 200 OK
Content-Type: application/json

{"user":{"id":"...","email":"jakubiak.krzy@gmail.com",...},
 "session":{"id":"...","expiresAt":"...","userId":"..."}}
```

If you see `{"user":null,"session":null}`, the cookie wasn't recognized. Either you copied the prefix (`better-auth.session_token=` should be in the `-H "Cookie: ..."` argument, NOT in the pasted value), or the session has expired.

### 6.7 (Optional) Cleanup

Wipe the test user — FK cascades remove the rest:

```bash
bun --env-file=.env -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
await sql\`DELETE FROM users WHERE email = 'jakubiak.krzy@gmail.com'\`;
console.log('Deleted test user + cascade: athletes, athlete_public_profiles, audit_log, auth_session, auth_account');
"
```

## 7. What you've learned

After completing this smoke test you can:

- Send a POST request with a JSON body using curl.
- Read response headers (`-i`) and recognize the standard ones (`Content-Type`, `Set-Cookie`, `Content-Length`).
- Find the right command flags for headers, methods, bodies, cookies.
- Use curl to drive a multi-step auth flow including session cookies.
- Translate "API says it does X" into "I can prove API does X."

That's ~80% of what you'll ever need curl for in day-to-day backend work. The rest (binary downloads, basic auth, multipart uploads) you can pick up via `--help` when the use case appears.

## 8. Debug cheat sheet

| Symptom | First check |
|---|---|
| `curl: (6) Could not resolve host` | DNS issue — for localhost: is `bun dev` actually running on port 3000? |
| `curl: (7) Failed to connect` | TCP refused — port not bound, server isn't running |
| Hanging forever | Add `--max-time 10`; pair with `-v` to see where TLS or DNS stalls |
| Server returns `{"error":"..."}` you don't understand | Re-run with `-v` to see all headers; check terminal 1 (dev server) for the stack trace |
| Cookie not sent on a follow-up | Use `-b cookies.txt -c cookies.txt` on both calls to share a jar |
| OAuth redirect chains | Add `-L` and `-v` to see every hop |
| Mac certificate complaints on https | `-k` skips verification (DEV ONLY); for prod, fix the cert chain |
| Output is binary garbage | You hit a JSON endpoint expecting text — pipe through `jq`: `curl -s URL \| jq` |

## 9. Where this fits next to other Forge docs

- **`auth-concepts.md`** explains *what* each endpoint does at the concept level.
- This doc shows *how* to drive the API with curl.
- **`database-workflow.md`** has the equivalent for the DB layer — when something's wrong, what to run.
- **`docker-workflow.md`** (lands with the testing sub-issue) will be the equivalent for the Docker layer.

The pattern: each foundational tool gets one concepts doc + one workflow/cheat-sheet doc.
