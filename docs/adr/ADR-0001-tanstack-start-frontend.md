# ADR-0001: TanStack Start as the web framework

- **Status:** Accepted
- **Date:** 2026-05-07
- **Deciders:** @kj-ninja

## Context

Forge is a single web app delivered as a mobile-first PWA. We need a full-stack React framework that supports SSR, server functions, and pairs cleanly with the rest of the TanStack ecosystem (Router, Query, DB, Form, Table) which we want to use throughout the app.

Constraints:

- Solo project, learning-oriented — picking a stack with strong learning value matters.
- Modern 2026 stack — should reflect current best practices, not yesterday's.
- Cloudflare-friendly deployment (Pages + Workers).

## Decision

Use **TanStack Start** (Vite-based full-stack React) with the full TanStack ecosystem: Router for navigation, Query for server state, DB for the local-first store, Form for inputs, Table for analytics views.

## Alternatives considered

### Next.js 15 (App Router + RSC)

- Pros: industry standard, biggest ecosystem, mature.
- Cons: heavier abstraction, "Vercel way" assumptions, weaker fit with the rest of the TanStack ecosystem we want to use.

### React Router 7 (ex-Remix)

- Pros: web-fundamentals first, mature.
- Cons: smaller community, less integration with TanStack ecosystem.

### React + Vite + TanStack Router (SPA only)

- Pros: lightest setup.
- Cons: no SSR, no server functions — would need a separate backend (Hono) up front, more moving parts on day 1.

## Consequences

### Positive

- Full type-safety end to end (TanStack Router is exceptionally strong here).
- Server functions live next to UI — simplest possible flow for forms and mutations.
- Vite as bundler — fastest dev mode in the ecosystem.
- Cloudflare adapter is first-class.

### Negative / trade-offs

- TanStack Start is younger than Next; some patterns are still evolving.
- Smaller pool of tutorials / Stack Overflow content vs Next.

### Follow-ups

- Set up the TanStack Start scaffold with Cloudflare adapter (Phase 0 of the plan).
- Document any TanStack-specific patterns we settle on as we go.
