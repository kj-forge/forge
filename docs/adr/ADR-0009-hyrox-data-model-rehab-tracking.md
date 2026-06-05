# ADR-0009: Hyrox-specific data model + rehab tracking as first-class domain

- **Status:** Accepted
- **Date:** 2026-05-16
- **Deciders:** @kj-ninja
- **Linear:** FRG initiative re-frame (to be updated)

## Context

After PR-7 (quality tooling) and a comprehensive multi-agent audit, the user's actual use case turned out to be substantially different from the original plan. Forge was scoped as a generic "training PWA for strength + running with daily notes". The user's real training journal — multi-paragraph reflections, structured Hyrox formats (EMOM/AMRAP/WORK/compromised run), an active tendon rehab with named protocols (A: Foot/Ankle, B: VMO), daily Sleep Score / HRV / HR Rest tracking, hard target Hyrox Sub-65' Gdańsk Oct 2026, athlete↔coach interest — modeled poorly in a schema designed around `session_exercises(sets × reps × weight)` and `running_logs`.

Continuing to extend the old schema would lead to predictable rewrites within a week of producing real product code.

## Decision

Adopt a **block-based data model** with rehab as a separate first-class domain.

Specifically:

1. **`sessions`** carry a `type` discriminator (`STRENGTH`, `HYROX_EMOM`, `HYROX_AMRAP`, `HYROX_WORK`, `CARDIO`, `COMPROMISED_RUN`, `REHAB`, `MOBILITY`) rather than splitting into table-per-type.
2. **`session_blocks`** model the structural unit of a session. One strength exercise = one block. One EMOM round = one block with multiple movements. One AMRAP finisher = one block, time-boxed. One Hyrox WORK piece = multiple blocks chained. This single abstraction handles every format the user does without a schema explosion.
3. **`block_movements`** sit between blocks and sets, holding targets (target_reps, target_weight_kg, target_duration_seconds, target_distance_m, rpe_cap). `sets` log the actual performance.
4. **`cardio_segments`** model multi-modality cardio sessions (e.g., "15 min Ski + 30 min Row") with explicit `modality` (RUN/BIKE/ROW/SKI/SWIM/MIXED) and `zone` (Z1-Z5/THRESHOLD/COMPROMISED) per segment.
5. **Rehab is its own domain** — `injuries`, `injury_events` (timeline of ortopeda visits, USG, flare-ups), `medications`, `rehab_protocols` (Protokół A/B seeded), `rehab_protocol_exercises`, `rehab_sessions`, `pain_checkins`. Rehab session is technically a `session` with `type=REHAB` but the rehab-specific tables hold protocol context that doesn't belong in workout schema.
6. **`exercises`** carry a `progression_rule_id` so each lift can have its own progression model (TOP_SET_BACKOFF, STRAIGHT_SETS, ENDURANCE_STRENGTH, RPE_CAPPED, QUALITY_FIRST). The 7 progression patterns the user uses fit cleanly into 5 named kinds with a `config` jsonb.
7. **Long-form session reflection** is a TEXT (markdown) column on `sessions.notes`. AI-extracted structured insights go into a separate `ai_extracted` jsonb later (P1).
8. **Hyrox stations** are seeded as a reference table with native units (SkiErg in meters, Wall Balls in reps, etc.). `race_results` table stores race entries with station_splits as jsonb.

Full schema in `docs/architecture/data-model.md`.

## Alternatives considered

### Alternative A — Extend the original generic schema with optional columns

Add `is_hyrox`, `hyrox_format`, `pain_severity`, `rehab_protocol_name` as nullable fields on the existing tables.

- **Pros:** less code; one schema for everything.
- **Cons:** sparsity (most rows null on hyrox-fields); querying rehab as "session where rehab_protocol_name is not null" is awkward; adding Hyrox stations or progression rules forces overloaded columns. Predictable rewrite within weeks.

### Alternative B — Polymorphic single-table inheritance with jsonb body

Store every session's structure in a single `body jsonb` column.

- **Pros:** flexibility; easy to add new formats.
- **Cons:** no SQL-level queryability of common fields (volume-per-muscle-group, weekly progression). pgvector RAG benefits from structured columns. AI summaries are harder when fields are inside jsonb.

### Alternative C — Block model (chosen)

Normalize structure into `sessions → blocks → block_movements → sets` with cardio_segments and rehab as separate concerns.

- **Pros:** queryable, matches every format cleanly, matches how the user thinks about sessions ("the EMOM block today went well, AMRAP finisher was easier").
- **Cons:** more tables; quick-log UI needs to abstract this for the user.

## Consequences

### Positive

- Schema reflects the user's actual training reality. Quick-log UI can lean on block model without forcing the user to think in DB rows.
- Rehab as separate domain means rehab-specific dashboards, alerts, and AI loops (pain ↔ load correlation) become straightforward.
- AI weekly summary can reason about structured data (avg HR per zone, total reps per Hyrox station, week-over-week strength deltas) instead of parsing jsonb.

### Negative / trade-offs

- More tables. ~18 tables vs ~8 in the original plan.
- Quick-log UI complexity is higher — block-aware entry needs careful UX (Vaul drawer + per-block forms).
- Migration story when (not if) the model needs another extension is real. Drizzle migrations from day 1 mitigate but don't eliminate.

### Follow-ups

- Write the first Drizzle migration matching `data-model.md` exactly. If they drift, update `data-model.md` first.
- Seed scripts for: exercises with PL aliases, 8 Hyrox stations, Protokół A/B with their exercises, user's 4 strength RM goals + Hyrox Sub-65' goal, race result for Poznań 2025-12 debut.
- Wire AI weekly summary loop (P1) to read structured data, not jsonb.

## References

- `docs/architecture/data-model.md` — full schema
- `/private/tmp/claude-501/.../w1ann9a0q.output` — audit workflow result (transient, archive if needed)
- `~/.claude/projects/-Users-chris-projects-forge/memory/forge-post-audit-scope.md` — P0/P1/P2 reshape
