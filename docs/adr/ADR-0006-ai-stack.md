# ADR-0006: Anthropic SDK + Vercel AI SDK + Deepgram for AI/voice

- **Status:** Accepted
- **Date:** 2026-05-07
- **Deciders:** @kj-ninja

## Context

AI is a core differentiator (P1+) for Forge: auto-summary of sessions, conversational logging, natural-language queries over training history, voice logging in the gym, and (P2) plan generation and injury risk warnings.

We want a stack that:

- gives us first-class Claude support (the user already operates on Anthropic's stack),
- supports streaming + tool calling cleanly,
- can do real-time STT for voice with Polish-language support,
- supports RAG over training history.

## Decision

- **LLM provider:** Anthropic — **Claude Sonnet 4.6** as the default, **Claude Opus 4.7** for heavier reasoning (auto-summary, plan generator).
- **SDK:** Anthropic SDK directly + **Vercel AI SDK** for streaming, tool calling, generative UI helpers where useful.
- **Voice (STT):** **Deepgram** — low latency, Polish support, real-time WebSocket API.
- **RAG:** `pgvector` on the same Neon Postgres ([ADR-0003](ADR-0003-postgres-neon-drizzle.md)) + Drizzle helpers.
- **Agents (P2):** AI SDK tool calling first; **Mastra** if we need multi-step orchestration for the plan generator.

When implementing, use the `claude-api` skill — it covers prompt caching, model selection, retries, and migration between Claude versions.

## Alternatives considered

### OpenAI

- Pros: similar capabilities, large ecosystem.
- Cons: we're already on Anthropic; switching costs and dual-vendor complexity have no upside here.

### Whisper for STT

- Pros: open-source, free if self-hosted.
- Cons: higher latency, weaker Polish, more infra to run.

### LangChain.js / LangGraph

- Pros: large ecosystem.
- Cons: heavy abstractions for what we need; AI SDK + Mastra are more idiomatic in TypeScript today.

## Consequences

### Positive

- Strong Polish support for voice (Deepgram) — critical for in-gym voice logging.
- Prompt caching cuts cost on repeated context (history of sessions when generating summaries).
- Tool calling via AI SDK is clean and type-safe with Zod schemas.

### Negative / trade-offs

- Vendor concentration on Anthropic — outage exposure. Acceptable for a personal app.
- Deepgram is paid — manageable for a solo project; track cost.

### Follow-ups

- Standardise prompts in `app/lib/ai/prompts/` with versioning.
- Define tool schemas in `app/lib/ai/tools/` (e.g. `add_set`, `query_db` with whitelist).
- Add cost telemetry from day 1 (token + STT minutes per request).
- Decide model selection per use case (Sonnet 4.6 vs Opus 4.7) — defer until we have real measurements.
