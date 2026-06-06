# Observability & Security — Forge

> Living document. Updated when dashboards land, accounts get provisioned, or runbooks evolve.
>
> See [ADR-0014](../adr/ADR-0014-observability-and-llm-gateway.md) for the rationale.

## Stack at a glance

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Category               Tool                  Free tier         Status   │
│ ─────────────────────  ────────────────────  ───────────────  ───────── │
│ Error tracking         Sentry                5k err / mo       Planned │
│ APM / traces           Sentry Performance    10k tx / mo       Planned │
│ Structured logs        Axiom                 0.5 GB/day        Planned │
│ Uptime + status page   Better Stack          10 monitors       Planned │
│ Product analytics      PostHog Cloud         1M events / mo    Planned │
│ Session replay         PostHog (same plan)   5k recordings/mo  Planned │
│ AI usage (dev view)    Anthropic Console     unlimited         Planned │
│ AI usage (per-user)    `ai_usage` table      $0                Schema only │
│ Rate limiting          Cloudflare RL         100k req/day      Planned │
│ WAF                    Cloudflare WAF        OWASP baseline    Planned │
│ Dependency scanning    Dependabot            free on public    Active  │
│ Secret scanning        GitHub native         free on public    Active  │
│ Static analysis        CodeQL                free on public    Paused  │
│ Alerts                 Discord webhook       free              Planned │
└─────────────────────────────────────────────────────────────────────────┘
```

All "Planned" items land in the **Observability & Security setup** epic (post-FRG-7 auth, before AI features).

## Dashboards (placeholders)

Bookmark these once each account is provisioned:

- **Sentry** — `https://forge.sentry.io/issues/` *(placeholder, sign-up in setup epic)*
- **PostHog** — `https://app.posthog.com/project/<id>/` *(placeholder)*
- **Axiom** — `https://app.axiom.co/forge/datasets/` *(placeholder)*
- **Better Stack** — `https://uptime.betterstack.com/` *(placeholder)*
- **Cloudflare** — `https://dash.cloudflare.com/` → Forge zone → Analytics & Logs
- **Anthropic Console** — `https://console.anthropic.com/usage` — per-API-key usage breakdown
- **OpenRouter** — `https://openrouter.ai/activity` — per-API-key + per-user-header usage
- **Neon** — `https://console.neon.tech/app/projects/forge` — DB queries, storage, branches
- **Discord alerts channel** — `#forge-alerts` in your Discord *(placeholder)*

## Routing — what alerts go where

```
Sentry (errors / regressions)           ─► Discord #forge-alerts
Sentry (performance regressions)        ─► Discord #forge-alerts
PostHog (error_* events spike)          ─► Discord #forge-alerts
Better Stack (monitor DOWN)             ─► Discord #forge-alerts + email
Cloudflare WAF (rule trigger spike)     ─► Discord #forge-alerts
Cloudflare Rate Limiting (block surge)  ─► Discord #forge-alerts
Neon (storage > 80% of quota)           ─► Email
GitHub Dependabot (critical CVE)        ─► Email + PR auto-opened
```

When `#forge-alerts` becomes noisy, split into `#forge-critical` (paging) and `#forge-warnings` (FYI).

## Privacy / PII rules — load-bearing

These rules are **non-negotiable** because Forge handles health-adjacent data (rehab, pain, injuries, medications, journal). Violations risk GDPR exposure and block the physio monetization path.

### What goes to third-party (Sentry, PostHog, Axiom)

| Type | OK to send | Never |
|---|---|---|
| User ID (uuid) | ✅ | |
| Athlete ID (uuid) | ✅ | |
| Email | ⚠️ Sentry user context only | ❌ PostHog payload |
| Route path | ✅ | |
| HTTP status | ✅ | |
| Event name (e.g. `session_logged`) | ✅ | |
| Reflection text | ❌ | ❌ |
| Pain notes / body region / severity | ❌ | ❌ |
| Journal entry body | ❌ | ❌ |
| Medication name / dosage | ❌ | ❌ |
| Injury name / notes | ❌ | ❌ |
| USG / scan attachment URLs | ❌ | ❌ |

### Session replay masking

The following routes have **full DOM masking enabled** in PostHog:

- `/rehab/*` — Protokół A/B sessions, exercise logging with side
- `/pain/*` — pain check-in flow
- `/journal/*` — free-form journal entries
- `/wellness/*` — Sleep / HRV / HR Rest entry
- `/injuries/*` — injury timeline, USG attachments

These routes can still emit **event names** (e.g., `pain_checkin_saved`) but the recording shows only masked rectangles.

### Sentry breadcrumb scrubbing

Sentry breadcrumbs strip body content from `POST /api/{injuries,pain-checkins,journal,medications,reflections}` — only the path, status, and timing are recorded.

## AI usage observability (`ai_usage` table)

Every call to `app/lib/ai/*` goes through a wrapper that inserts a row into `ai_usage`:

```ts
{
  id, athleteId, provider, model, promptType,
  inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
  costUsd, latencyMs, success, errorCode, requestId,
  createdAt,
}
```

`provider` defaults to `OPENROUTER` (per ADR-0014). The `requestId` field captures OpenRouter / Anthropic request IDs for cross-referencing in their dashboards.

### Per-user limits (planned billing scaffolding)

| Tier | Weekly AI summary | Conversational logs / mo | Voice transcription / mo |
|---|---|---|---|
| FREE | 1 / week | 30 | 5 min |
| PRO | unlimited | 1000 | 60 min |
| COACH | unlimited | unlimited | unlimited |

Numbers are **placeholders**. Will be tuned once cost data is in — that's why we collect `ai_usage` from day 1.

## Rate limiting (planned Cloudflare rules)

| Endpoint | Limit | Window | Action |
|---|---|---|---|
| `POST /api/auth/*` | 5 req | 60 s per IP | Block 15 min |
| `POST /api/ai/*` | 10 req | 60 s per athlete | 429 |
| `POST /api/sessions` | 100 req | 60 s per athlete | 429 |
| `GET /api/*` | 600 req | 60 s per athlete | 429 |
| `POST /api/export` | 1 req | 24 h per athlete | 429 |

## Runbooks

Each subsection here gets fleshed out as the corresponding tool lands.

### "We're being attacked / WAF is firing"

1. Check Cloudflare → Security → Events. Confirm pattern (which rule, which IPs).
2. If sustained: enable "Under Attack mode" in Cloudflare (Settings → Security).
3. Block specific IPs/ASNs if needed.
4. Investigate logs in Axiom for the affected athlete IDs.
5. Post-incident: review `audit_log` for unauthorized data access.

### "Sentry shows a new error"

1. Open the error → check breadcrumbs + transaction trace.
2. Reproduce locally if possible.
3. If user-facing impact: prioritize fix; if internal: file an issue.
4. Tag the error as `regression` in Sentry if it's a re-occurrence.

### "AI costs are spiking"

1. Open Anthropic Console — confirm which model/key.
2. Open OpenRouter dashboard — sort by user.
3. Query `ai_usage` for the past 24h grouped by `athleteId` — find the outlier.
4. Check `auditLog` for that athlete — looking for compromised account / abuse.
5. Lower rate limit on `/api/ai/*` if necessary while investigating.

### "Database is slow / Neon dashboard shows long queries"

1. Open Neon dashboard → Insights → Slow Queries.
2. `EXPLAIN ANALYZE` the offender locally.
3. Check if the index is being used.
4. If a missing index, add via Drizzle migration.

## Setup checklist (for the future Observability epic)

- [ ] Create Sentry org `forge` + project (TypeScript / Cloudflare Workers + React)
- [ ] Create PostHog cloud project + capture team-side allowlist for events
- [ ] Create Axiom org + dataset `forge-workers` + Cloudflare Logpush job
- [ ] Create Better Stack account + 5 initial monitors (forge.app health, Neon health, OpenRouter, Anthropic, Deepgram)
- [ ] Create Discord server / channel `#forge-alerts` + 4 webhooks (one per upstream)
- [ ] Cloudflare → Security → enable WAF Managed Rules (free tier)
- [ ] Cloudflare → Security → Rate Limiting → add 5 rules per table above
- [ ] Wire `db/audit-log-middleware.ts` to write `audit_log` on every mutation through Drizzle
- [ ] Wire `app/lib/ai/wrap.ts` to write `ai_usage` on every Vercel AI SDK call
- [ ] Re-enable `.github/workflows/codeql.yml` (currently paused)
- [ ] Document final dashboard URLs in this file

## References

- [ADR-0014](../adr/ADR-0014-observability-and-llm-gateway.md) — rationale and stack
- [ADR-0013](../adr/ADR-0013-monetization-ready-schema.md) — `audit_log`, `ai_usage`, `consents` tables
- [Cloudflare Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [PostHog session replay privacy](https://posthog.com/docs/session-replay/privacy)
- [Sentry + Cloudflare Workers integration](https://docs.sentry.io/platforms/javascript/guides/cloudflare/)
