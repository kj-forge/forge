# ADR-0012: Drizzle ORM conventions

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** @kj-ninja
- **Linear:** FRG-6

## Context

[ADR-0003](ADR-0003-postgres-neon-drizzle.md) committed Forge to Postgres on Neon with Drizzle ORM. This ADR fills in the **implementation-level conventions** so that as the schema grows, every new table looks the same and follows the same rules. The conventions also encode the multi-tenant invariant from [ADR-0010](ADR-0010-multi-tenant-schema.md).

Constraints that shaped these conventions:

- **Cloudflare Workers deploy target** — the runtime uses `@neondatabase/serverless` HTTP driver, so the schema must work over HTTP (no driver-specific features that assume persistent TCP sessions).
- **Multi-tenant from day 1** — every owned row carries `athlete_id` directly, not via multi-hop joins.
- **Electric SQL local-first sync (P1)** — sync shapes are scoped per-row by `athlete_id`; rows that can't self-identify their owner break this model.
- **Public repo + portfolio piece** — the schema should read like senior-engineer work.

## Decision

The schema follows **nine conventions**, enforced by `drizzle.config.ts` and reinforced by code review:

1. **camelCase in TS, snake_case in DB**, mapped automatically by `casing: "snake_case"` in both `drizzle.config.ts` and `db/client.ts`. We never specify column names manually — Drizzle derives them from the TS property name.
2. **UUID primary keys with `defaultRandom()`** on every table. No auto-increment integers.
3. **`timestamptz` for moments in time, `date` for calendar days only.** Bare `timestamp` is banned.
4. **`pgEnum` for fixed value sets**, never `text` + `CHECK`. Drizzle gives us TS unions for free this way.
5. **`jsonb` with `$type<>()`** for loose/nested data (aliases arrays, structured configs, attachments). Plain `jsonb()` without a TS type is a code smell.
6. **`athlete_id NOT NULL` on every owned table**, with `.references(() => athletes.id, { onDelete: "cascade" })` and an index that starts with `athleteId`. This is the multi-tenant invariant from ADR-0010, made concrete. Tables that are not owned (catalogs like `exercises`, `hyrox_stations`, `progression_rules`, `rehab_protocols`; auth principals like `users`, `coaches`; link tables) do not carry `athlete_id`.
7. **`onDelete` is always explicit** on every foreign key: `cascade` for owned data, `restrict` for catalog references (e.g., `block_movements.exercise_id`), `set null` for nullable links (e.g., `rehab_sessions.protocol_id`).
8. **Named indexes only** — every `index()` / `uniqueIndex()` has an explicit name (`<table>_<columns>_idx`). No anonymous indexes from `.unique()`-on-column shortcuts in catalogue tables (we use explicit `uniqueIndex(...)` instead so the name is visible in `pg_indexes`).
9. **Denormalize `athlete_id` aggressively, never soft-delete.** When a child row's athlete can be reached only through multiple FK hops (e.g., `sets → blockMovements → sessionBlocks → sessions → athletes`), we denormalize: the child carries `athlete_id` directly. Soft delete (`deleted_at` column) is forbidden — we use real `DELETE` plus an immutable `audit_log` trail.

The `relations()` API from Drizzle is **deferred** to a future PR. We use explicit `leftJoin` / `innerJoin` for now; `relations()` lands when the first feature epic needs the `db.query.<table>.findMany({ with: ... })` ergonomics.

## Alternatives considered

### A — Specify column names manually instead of `casing` auto-conversion

Pros: column names are visible in the TS source, no magic.
Cons: every column gets typed twice (`namePl: text("name_pl")`), 2× boilerplate, error-prone (typos in the string don't fail typecheck). The `casing` option is mature in Drizzle 0.30+ and Postgres-idiomatic snake_case is a settled convention.

### B — Auto-increment `bigserial` IDs instead of UUIDs

Pros: 8 bytes vs 16 bytes; faster index scans; lower storage.
Cons: leaks count of rows ("/athletes/4234" tells everyone we have ~4k users); not multi-instance friendly (conflicts when merging branches in Neon); can't generate IDs on the client (relevant for Electric SQL sync). UUIDs cost a few microseconds we don't notice and unlock the above.

### C — Soft delete with `deleted_at` column

Pros: easy undo; preserved history in same table.
Cons: every query must remember `WHERE deleted_at IS NULL` — forget once and you leak other athletes' "deleted" data; FK constraints see deleted rows as live; GDPR right-to-erasure needs real DELETE anyway. We get the "audit trail" benefit via `audit_log` instead, with stronger guarantees.

### D — Strict 3NF without `athlete_id` denormalization

Pros: textbook-clean relational model; single source of truth per fact.
Cons: every analytics query joins through 2–4 tables to find the athlete; Electric SQL sync shapes get expensive; row-level security policies become multi-hop. The denormalization buys real performance + sync simplicity at the cost of duplicated 16-byte UUIDs (~40 MB at 1M sessions — pomijalne).

### E — Drizzle `relations()` defined alongside tables in schema.ts

Pros: complete schema in one read; nicer query ergonomics from day 1.
Cons: adds ~30% to file length without any consumer (no feature epic uses relations yet). We defer to the first epic that needs them and add relations in a focused PR.

## Consequences

### Positive

- Every new table starts from a checklist (UUID PK, athlete_id, timestamps, indexes, named) — no decisions needed for each table.
- Schema reads consistently — `db/schema.ts` is scannable.
- Multi-tenant invariant is enforced by the conventions themselves, not just by convention; a code review for "where's the athlete_id index?" works mechanically.
- Future migrations to row-level security (RLS) and Electric SQL sync shapes are unblocked.
- Portfolio readability — schema demonstrates senior engineering judgment.

### Negative / trade-offs

- Denormalized `athlete_id` is duplicated data; programmer must keep it consistent on inserts (the column is `NOT NULL`, the value comes from the parent's `athlete_id`).
- Explicit index naming is more typing than relying on Drizzle/Postgres defaults.
- `casing: "snake_case"` is a small piece of magic — anyone unfamiliar with Drizzle will wonder why TS `namePl` becomes SQL `name_pl`. Docs (this ADR + `db/schema.ts` header) cover it.
- Deferring `relations()` means `leftJoin` boilerplate in the first few server functions. Acceptable tax for keeping the schema epic scoped.

### Follow-ups

- Add Drizzle `relations()` in the first epic that needs nested queries (`db.query.athletes.findMany({ with: { sessions: true } })`).
- Add row-level security policies in a follow-up ADR once auth lands.
- Schema linter or pre-commit hook that fails if a new owned table lacks `athlete_id` index — nice-to-have, defer until we see drift.

## References

- [ADR-0003](ADR-0003-postgres-neon-drizzle.md) — Postgres on Neon + Drizzle
- [ADR-0010](ADR-0010-multi-tenant-schema.md) — Multi-tenant schema from day 1
- [ADR-0013](ADR-0013-monetization-ready-schema.md) — Monetization-ready schema additions (this PR)
- [data-model.md](../architecture/data-model.md) — table-by-table specification
- [Drizzle casing option](https://orm.drizzle.team/docs/sql-schema-declaration#snake-case-and-camel-case)
- [Drizzle indexes](https://orm.drizzle.team/docs/indexes-constraints)
