# ADR-0004: Better Auth with email magic link + Google OAuth

- **Status:** Accepted
- **Date:** 2026-05-07
- **Deciders:** @kj-ninja

## Context

Forge needs auth from day 1 — even as a solo user, the data model assumes per-user scoping (sync shapes in Electric, per-user analytics, future multi-user support). We want low-friction sign-in (no password if possible) and to learn a modern, framework-agnostic auth library.

## Decision

Use **Better Auth** with two providers:

- **Email magic link** (via Resend for delivery)
- **Google OAuth**

Auth tables live in our Postgres (Neon). Sessions are issued via cookies with httpOnly + secure flags.

## Alternatives considered

### Auth.js (NextAuth)

- Pros: largest provider catalogue.
- Cons: roots in Next.js, the API surface feels older next to Better Auth, less TypeScript-first.

### Clerk

- Pros: 5-minute setup, polished UX (passkeys, MFA).
- Cons: paid beyond a free tier, vendor lock-in, less learning value (mostly black-box).

### Supabase Auth

- Pros: bundled with Supabase Postgres.
- Cons: tied to Supabase as DB platform — we're using Neon (see [ADR-0003](ADR-0003-postgres-neon-drizzle.md)).

## Consequences

### Positive

- Modern TypeScript-first API — good ergonomics with Drizzle and Zod.
- Provider-agnostic — easy to add passkeys or other OAuth providers later.
- Auth state lives in our Postgres — no extra system to debug or back up.

### Negative / trade-offs

- Younger than Auth.js — fewer Stack Overflow answers.
- We're responsible for email deliverability tuning (via Resend).

### Follow-ups

- Define session strategy for offline scenarios (Electric needs an authenticated WebSocket; sessions must work after long offline windows).
- Configure Resend domain + DKIM/SPF before first deploy.
- Rate-limit magic link requests to prevent abuse.
