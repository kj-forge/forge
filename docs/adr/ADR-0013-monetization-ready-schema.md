# ADR-0013: Monetization-ready schema additions

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** @kj-ninja
- **Linear:** FRG-6

## Context

Forge started as a personal Hyrox journal. After re-framing in [ADR-0009](ADR-0009-hyrox-data-model-rehab-tracking.md) / [ADR-0010](ADR-0010-multi-tenant-schema.md), monetization became a real path on the table (freemium athlete, coach platform, physio/clinic license, team/box). The MVP UI is still single-user in P0, but **architecture decisions should preserve monetization optionality from day 1** — not by building Stripe and pricing pages, but by adding the **schema-level scaffolding** that's cheap to put in now and expensive to retrofit later.

Constraints:

- Repo is **public** → no real user data hardcoded in committed source.
- GDPR compliance is non-negotiable once we touch health-adjacent data (pain, meds, USG photos). This affects audit logging, consent records, data portability.
- Polish-first UI today, German/English expansion P1+ if monetization clicks.
- Per-user AI cost tracking is needed even before billing exists (to size the free tier).

## Decision

Add the following to `db/schema.ts` in the same PR as the core data model, all with safe defaults so the P0 single-user UI ignores them.

### New columns on `athletes`

- `locale text NOT NULL DEFAULT 'pl'` — i18n-ready. Polish for now, swap value to enable EN/DE per athlete.
- `timezone text NOT NULL DEFAULT 'Europe/Warsaw'` — required for "today" / "yesterday" semantics on daily wellness, pain check-ins, journal entries.
- `subscription_tier enum NOT NULL DEFAULT 'FREE'` — values: `FREE | PRO | COACH | PHYSIO | CLINIC | LIFETIME`.
- `subscription_status enum NOT NULL DEFAULT 'NONE'` — values: `ACTIVE | CANCELLED | PAST_DUE | TRIAL | NONE`.
- `last_seen_ip text NULL` — security signal.
- `last_seen_user_agent text NULL` — security signal.
- `last_login_at timestamptz NULL` — security signal + "your devices" UI later.

### New enum values

- `coach_role` += `PHYSIO` (alongside `PRIMARY | BACKUP | VIEWER`) — physio path is a realistic monetization route per [forge-monetization-on-the-table](../../.claude/projects/-Users-chris-projects-forge/memory/forge-monetization-on-the-table.md), zero cost to enable now.

### New tables

| Table | Purpose | Cost to add later |
|---|---|---|
| `athlete_public_profiles` | Per-athlete public-shareable profile (slug, display name, opt-in visibility flags). Powers viral mechanic ("share my Hyrox journal"). | Migration touching every athlete row + backfill |
| `audit_log` | Append-only trail of changes to sensitive data (injuries, meds, pain, rehab). GDPR-required for the physio path. | Painful — needs trigger-based history reconstruction |
| `data_export_requests` | Tracks athlete-initiated full data exports per GDPR Art. 20. Status enum + signed URL + expiry. | Easy table add, but the workflow assumes it exists |
| `consents` | Records each version of T&C / Privacy / Marketing / AI training opt-ins per athlete. Required once payment processors touch the system. | Migration + retroactive consent prompts on next login |
| `referrals` | Pre-built referral mechanic (referrer → referred email → optional referred athlete + conversion timestamps). Hyrox is community-driven so referrals matter. | Adding now is free; adding after launch needs a backfill flow |

### What we explicitly do NOT add

- **No `organizations` / `tenants` / `workspaces` table.** P0 + P1 monetization paths (freemium, coach, physio) all fit `athlete + athlete_coach_links + role enum`. The `organizations` layer becomes relevant for path D (team/box subscriptions), which is at least a year out. Adding it day 1 = premature complexity.
- **No Stripe-specific fields** (`stripe_customer_id`, `stripe_subscription_id`, etc.). When Stripe lands we add one focused migration. Schema doesn't need to know about Stripe yet.
- **No billing / invoice tables.** Same reason.
- **No feature_flags table.** PostHog feature flags cover us until self-hosted flags become an issue.

## Alternatives considered

### A — Strict YAGNI: ship MVP schema with zero monetization scaffolding

Pros: smallest possible PR, faster to type, no over-engineering risk.
Cons: every column above costs ~5 minutes to add now and ~1 day each (migration + backfill + UI + tests) to add later. Public profile slugs in particular require backfilling every athlete with a unique slug — fragile. GDPR scaffolding (audit_log, consents, data_export_requests) is **not optional** if we touch physio or B2B — adding under deadline pressure is worse than now. The 30 minutes spent here is the cheapest insurance we'll ever buy.

### B — Add a full `organizations` table now for future team/box subscriptions

Pros: future-proof for path D.
Cons: massive premature abstraction. Every athlete-owned row would need `organization_id` (potentially null) too — doubles the multi-tenancy surface area without a single consumer in the next 12 months.

### C — Add Stripe-specific columns now to "stay ahead"

Pros: feels future-proof.
Cons: Stripe data shapes change; their object names leak into our schema; we'd be supporting a specific PSP before deciding we want them. Stripe migrations are easy to add later.

## Consequences

### Positive

- Monetization paths A (freemium), B (coach), C (physio) are unblocked at the schema level — the work to launch them becomes UI + Stripe + landing, not "rewrite the schema".
- GDPR compliance has a foundation (audit log + consents + data export) the day we onboard the second user.
- i18n / multi-region UX is ready (locale + timezone per athlete) — Polish-first today, EN/DE swap is just translation files.
- Security telemetry (`last_seen_*`) gives us "this device logged in from a new location" UX for free.
- Viral mechanic (public profile share URL) can be enabled with a UI toggle.

### Negative / trade-offs

- The schema is **larger than the P0 UI needs.** 6 extra tables + 7 extra columns are unused on day 1. Mitigation: every addition has a clear future use case captured here; this is not speculative over-engineering.
- Schema bytes per athlete row are ~250 bytes larger than minimum. At 100k athletes that's ~25 MB. Pomijalne.
- "Public repo + monetization options" tension — we explicitly avoided hardcoding personal data in seed (see `db/seed.ts` env-driven values + gitignored `db/seed-personal.local.ts`).

### Follow-ups

- **ADR-0015** — Stripe integration (when ready to launch paid).
- **ADR for RLS policies** once auth lands — `subscription_tier` will gate feature flags via RLS or app-level checks.
- Implement `audit_log` writes through Drizzle middleware (or a wrapper layer) in the auth epic.
- Implement `consents` capture in the signup/onboarding flow.
- Implement `data_export_requests` worker (Cloudflare Worker that builds a zip and signs an R2 URL) — defer until first user requests it.
- `public_slug` generation strategy (lowercase + dashes + collision suffix?) — solved during first profile flow.

## References

- [ADR-0009](ADR-0009-hyrox-data-model-rehab-tracking.md) — Hyrox data model
- [ADR-0010](ADR-0010-multi-tenant-schema.md) — Multi-tenant invariant
- [ADR-0012](ADR-0012-drizzle-conventions.md) — Drizzle conventions
- [ADR-0014](ADR-0014-observability-and-llm-gateway.md) — Observability + LLM gateway
- [data-model.md](../architecture/data-model.md) — full table specification
- GDPR Article 20 — Right to data portability
- GDPR Article 30 — Records of processing (informs `audit_log` shape)
