# ADR-0014: Observability stack and LLM gateway strategy

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** @kj-ninja
- **Linear:** FRG-6

## Context

Forge ships AI features from P1 (weekly summary, conversational logging, NL query, voice). Solo-dev projects routinely under-invest in observability and get caught flat-footed when something breaks in production. We want to pick the stack **before** any of these features land so the wiring is a small add-on per epic, not a panic.

Two distinct topics are bundled in this ADR because they share infrastructure decisions:

1. **Observability** — error tracking, structured logs, performance traces, uptime, product analytics, session replay, security alerts.
2. **LLM gateway** — how we call AI APIs and how we attribute usage per athlete (needed for billing, free-tier limits, abuse detection).

[ADR-0006](ADR-0006-ai-stack.md) committed Forge to Anthropic SDK + Vercel AI SDK + Deepgram for AI/voice. This ADR is additive: it adds an **OpenRouter gateway layer** between the AI SDK and providers, and is **not a supersession** of ADR-0006 (we still use Anthropic Claude as the primary model, Vercel AI SDK as the client interface, Deepgram for STT — OpenRouter just routes the LLM calls).

Constraints:

- Forge is solo-dev with strict cost discipline. Everything must fit a free tier through year 1.
- Health-adjacent data (rehab, pain, journal notes) must **never** be sent to third-party analytics. Events only, payloads stay in our DB.
- Public repo + portfolio value — the choice should look modern and considered.
- Per-end-user AI attribution is needed for the monetization paths from [ADR-0013](ADR-0013-monetization-ready-schema.md) (Free vs Pro tier limits).

## Decision

### Observability stack

| Layer | Tool | Free tier | Cost beyond | Why |
|---|---|---|---|---|
| Error tracking | Sentry | 5k errors / mo + 10k transactions | $26/mo Team | De-facto standard; Cloudflare Workers native SDK |
| APM / traces | Sentry Performance | included | included | One vendor for errors + traces |
| Structured logs | Axiom | 0.5 GB / day, 30-day retention | $25/mo | SQL-like query UI; Cloudflare Logpush integration |
| Uptime + status page | Better Stack | 10 monitors, 3-min checks | $24/mo | Polish company; built-in public status page |
| Product analytics | PostHog Cloud | 1M events + 5k recordings / mo | $0.00031/event | Open source option later; feature flags + session replay included |
| Session replay | PostHog (same plan) | included | included | Masking enabled by default on PII routes |
| AI dashboards (dev) | Anthropic Console | included with API account | n/a | Per-API-key breakdown of usage |
| AI dashboards (per-user) | Custom `ai_usage` table | $0 | $0 | Per-end-user attribution stays in our DB |
| Rate limiting | Cloudflare Rate Limiting | 100k req/day evaluated | per req | Edge enforcement |
| WAF | Cloudflare WAF | basic OWASP rules | $20/mo Pro | Free tier covers MVP |
| Dependency scanning | GitHub Dependabot | free on public repos | n/a | Already configured |
| Secret scanning | GitHub native | free on public repos | n/a | Already enabled |
| Static analysis | CodeQL | free on public repos | n/a | Workflow stub in repo, unpause post-FRG-6 |
| Alerting hub | Discord webhook | free | free | Single `#forge-alerts` channel; Sentry/Better Stack/Cloudflare all integrate |

**Year-1 cost target: $0.** Beyond, ~$50–100/mo if any tier overflows around launch — still small.

### LLM gateway

Use **OpenRouter** as the gateway in front of all LLM providers, accessed via Vercel AI SDK's `@openrouter/ai-sdk-provider`.

```
[Forge code]
   ↓
[Vercel AI SDK]  ← unified streaming / tool-call interface
   ↓
[OpenRouter]     ← single API key, single billing relationship, dashboard,
   │              per-user attribution via X-OpenRouter-User header
   ├─► [Anthropic Claude]   (default — Sonnet 4.6 for most, Opus 4.7 for weekly summary)
   ├─► [OpenAI GPT]         (experiments, fallback)
   └─► [Google Gemini]      (future)

   ↕ in parallel with each call:

[Postgres `ai_usage` table]   ← per-call record: athlete_id, model, prompt_type,
                                tokens, cost, latency, success, request_id
```

- Deepgram (STT) is **not routed through OpenRouter** — different category (speech-to-text, not LLM), called directly per ADR-0006.
- Custom `ai_usage` table is the per-end-user record. OpenRouter's dashboard is per-API-key; we need per-athlete for Free-vs-Pro tier limits.
- A thin wrapper around the AI SDK call inserts into `ai_usage` on every request (success or failure). Wrapper lives in `app/lib/ai/` and lands with the first AI feature.

### Privacy / PII rules (load-bearing)

- **PostHog events only carry IDs, never payloads.** No reflection text, pain notes, journal body, medication names. Route table for "what's safe" lives in `app/lib/analytics/`.
- **Session replay is masked on all health-adjacent routes** (`/rehab/*`, `/pain/*`, `/journal/*`, `/wellness/*`). PostHog default masking + per-route overrides.
- **Sentry breadcrumbs scrub free-text body fields** of injuries, journal entries, reflections — only the path and status code go in error reports.
- **Axiom log shipping** strips body content from request logs (per Cloudflare Logpush filter).

### Alerting

A single Discord channel `#forge-alerts` is the triage point. Every tool above ships native Discord integration:

- Sentry → Discord on new issue / regression
- PostHog → Discord on `error_*` events spike
- Better Stack → Discord on monitor down
- Cloudflare → Discord on WAF rule trigger spike

Once the volume of alerts becomes meaningful, we split by severity (e.g., critical to phone via Better Stack on-call).

## Alternatives considered

### A — Direct Anthropic SDK only, no gateway

Pros: lowest latency; no extra vendor; no markup.
Cons: locks us to Anthropic for LLMs; experimenting with other models means writing a custom router; per-user dashboards have to be built from scratch (vs OpenRouter dashboard free). For a learning project that wants to demo modern multi-model patterns, OpenRouter is the more interesting choice.

### B — Helicone as observability proxy layered on Anthropic direct

Pros: free per-user attribution dashboards; cache hit detection out-of-the-box.
Cons: adds a hop without the multi-model benefit OpenRouter brings; duplicates `ai_usage` (Helicone DB + our DB); we still need our own table for billing logic. OpenRouter does what Helicone does **and** routes to many providers; we pick the broader tool.

### C — Datadog for everything (logs + APM + uptime + analytics)

Pros: single pane of glass; enterprise-grade.
Cons: $31/host minimum + per-metric pricing; rapidly $200+/mo at our scale; over-engineered for solo-dev. The composed-best-of-breed free tiers above give us a more capable stack at $0.

### D — Self-host PostHog + Loki + Grafana on Fly.io / Hetzner

Pros: ultimate cost ceiling; data sovereignty.
Cons: infrastructure work we don't want — distracts from product. Pick this up if PostHog cloud bills cross meaningful thresholds.

### E — Skip observability entirely until problems show up

Pros: less to build.
Cons: production incidents are 10× more expensive to debug after the fact; portfolio value of "we ship with observability from day 1" is real; free-tier cost is $0. No upside to skipping.

## Consequences

### Positive

- Production-grade observability from day 1 at $0 cost — strong portfolio signal.
- Per-end-user AI cost tracking is in place before billing exists, so we can size the free tier accurately.
- Multi-model flexibility — A/B testing different LLMs for different prompt types is a one-line config change.
- GDPR posture is consistent (no PII in third-party analytics, supports the physio path later).
- Discord alerts give us a real-time signal channel that scales to a community of users later.

### Negative / trade-offs

- More vendors to track (Sentry + PostHog + Axiom + Better Stack + OpenRouter + Cloudflare + Anthropic + Deepgram). Each has its own dashboard, login, free-tier limit to watch.
- OpenRouter adds ~30–100 ms latency per LLM call vs direct Anthropic — irrelevant for weekly summary, possibly noticeable for voice conversational logging. Mitigation: WebSocket transactions / fallback to direct Anthropic for hot paths if it ever becomes a problem.
- ~5% OpenRouter markup on model pricing. Cents at our scale; negotiable later via volume.
- Per-call insert into `ai_usage` adds ~5 ms of DB write per AI call. Acceptable.

### Follow-ups

- **Implementation epic (~FRG-12):** wire Sentry client, PostHog client, Axiom logpush, Better Stack monitors, Cloudflare WAF/Rate Limiting rules, Discord webhook routing.
- **AI integration epic (~FRG-13):** install `@openrouter/ai-sdk-provider`, build the `ai_usage` wrapper, wire prompt caching via Vercel AI SDK provider options.
- Build `app/lib/analytics/` helper with allowlist of safe event payloads (so PII can't accidentally be sent to PostHog).
- Add a `docs/architecture/observability.md` living doc with current dashboard URLs (placeholder until accounts created).
- Pause-state on `.github/workflows/codeql.yml` is unpaused after FRG-6 lands code that's worth analyzing.

## References

- [ADR-0006](ADR-0006-ai-stack.md) — Original AI stack decision (Anthropic SDK + Vercel AI SDK + Deepgram). This ADR is additive, not a supersession.
- [ADR-0013](ADR-0013-monetization-ready-schema.md) — `ai_usage` table is referenced from there as monetization scaffolding.
- [observability.md](../architecture/observability.md) — Living doc with dashboards + runbooks.
- [forge-monetization-on-the-table memory](../../.claude/projects/-Users-chris-projects-forge/memory/forge-monetization-on-the-table.md)
- Sentry docs — Cloudflare Workers integration
- OpenRouter — https://openrouter.ai
- Vercel AI SDK + OpenRouter provider — https://sdk.vercel.ai/providers/community-providers/openrouter
- PostHog masking — https://posthog.com/docs/session-replay/privacy
