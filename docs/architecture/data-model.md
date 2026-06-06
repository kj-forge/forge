# Forge — Data Model

> Captures the post-audit re-frame: Forge is a **Hyrox athlete journal with rehab tracking, daily wellness metrics, AI-driven weekly summaries, and athlete↔coach sharing**.
>
> Living document. Updated when entities, fields, or enums change. The Drizzle schema in [`db/schema.ts`](../../db/schema.ts) is the **authoritative** source — this doc captures intent, ADRs capture rationale. If they drift, schema.ts wins; update this doc.
>
> **Related ADRs:**
> - [ADR-0009](../adr/ADR-0009-hyrox-data-model-rehab-tracking.md) — Hyrox-specific data model + rehab as a first-class domain
> - [ADR-0010](../adr/ADR-0010-multi-tenant-schema.md) — Multi-tenant invariant (every owned row carries `athlete_id`)
> - [ADR-0012](../adr/ADR-0012-drizzle-conventions.md) — Drizzle conventions (snake_case, UUID, denormalization, no soft delete)
> - [ADR-0013](../adr/ADR-0013-monetization-ready-schema.md) — Monetization-ready additions (locale/tz/subscription, public profile, audit_log, consent, referrals)
> - [ADR-0014](../adr/ADR-0014-observability-and-llm-gateway.md) — Observability stack + `ai_usage` table

## Design principles

1. **Multi-tenant from day 1.** Every owned row has `athlete_id`. `users` is the auth principal; `athletes` are profiles linked to users (1:1 default, expandable). UI is single-user in P0; coach linking activates in P1. See ADR-0010.
2. **Block model for sessions.** A `session` doesn't directly own sets — it owns `blocks` which own `block_movements` which own `sets`. This lets one schema model strength (1 block, many movements, many sets), Hyrox EMOM (1 block, many movements, time-boxed), AMRAP finisher (1 block, multiple rounds), compromised run, etc. See ADR-0009.
3. **Rehab is a separate domain, not a workout.** `rehab_sessions` and `protocols` live in their own tables because rehab cadence (daily check-in, Protokół A/B), constraints (post-injury), and questions (pain trends vs load) are different from training.
4. **Wellness metrics are daily, wide, and few.** No TimescaleDB — ~5 metrics × years = thousands of rows. Wide `daily_metrics` table + BRIN index on `(athlete_id, day)` is sufficient.
5. **Long-form reflection is TEXT (markdown), not VARCHAR.** AI extracts structured insights into a separate jsonb column; the raw text stays editable.
6. **Wearable source is an enum.** Manual `.FIT` upload day 1 (P1), Garmin Health API later, others future. Schema doesn't care which source filled the row.

## Core entities

### Authentication & identity

| Entity | Purpose | Key fields |
|---|---|---|
| `users` | Auth principal (email, password hash, OAuth tokens). Better Auth manages. | id, email, name, created_at |
| `athletes` | Athletic profile attached to a user. The primary tenant unit. | id, user_id, username (public), bio, born_at, sex, height_cm, weight_kg, **locale (default 'pl')**, **timezone (default 'Europe/Warsaw')**, **subscription_tier (default 'FREE')**, **subscription_status (default 'NONE')**, **last_seen_ip**, **last_seen_user_agent**, **last_login_at**, created_at, updated_at — bold fields added per ADR-0013/14 |
| `athlete_public_profiles` | Public-shareable profile (slug, display name, opt-in visibility flags). Powers viral mechanic. ADR-0013. | id, athlete_id (unique), public_slug (unique), is_public, display_name, display_bio, display_avatar_url, display_race_results_public, display_pr_public, created_at, updated_at |
| `coaches` | Coach profile (a coach is also an athlete, but with this row attached). | id, user_id, bio, certifications |
| `athlete_coach_links` | Coach↔athlete relationship with role. | id, athlete_id, coach_id, role (PRIMARY \| BACKUP \| VIEWER), started_at, ended_at |
| `athlete_follows` | "Other athletes I watch" — minimal social. Public profile view. | id, follower_athlete_id, followed_athlete_id, since |

### Sessions, blocks, sets (the core training data)

| Entity | Purpose | Key fields |
|---|---|---|
| `sessions` | One training session (or rehab session). | id, athlete_id, date, started_at, ended_at, type (`STRENGTH` \| `HYROX_EMOM` \| `HYROX_AMRAP` \| `HYROX_WORK` \| `CARDIO` \| `COMPROMISED_RUN` \| `REHAB` \| `MOBILITY`), title, location, notes (TEXT, markdown), source (`MANUAL` \| `IMPORTED`), ai_summary (TEXT, markdown — populated by weekly summary job in P1), created_at, updated_at |
| `session_blocks` | A block within a session. EMOM = 1 block, AMRAP finisher = 1 block, strength session = 1 block per exercise, Hyrox WORK = multiple. | id, session_id, order_index, kind (`STRAIGHT_SETS` \| `EMOM` \| `AMRAP` \| `WORK_INTERVAL` \| `REST`), duration_seconds, work_seconds, rest_seconds, target_rounds, notes |
| `block_movements` | A movement within a block. For strength: one row per exercise (with sets below). For EMOM/AMRAP: one row per movement in the rotation. | id, block_id, order_index, exercise_id, target_reps, target_weight_kg, target_duration_seconds, target_distance_m, target_calories, rpe_cap |
| `sets` | Concrete set log (the thing user enters quick-log style). | id, block_movement_id, set_number, reps, weight_kg, duration_seconds, distance_m, calories, rpe, is_warmup, notes |
| `cardio_segments` | For cardio sessions: per-modality segment within a single session. Lets us model "15 min Ski + 30 min Row" in one session. | id, session_id, order_index, modality (`RUN` \| `BIKE` \| `ROW` \| `SKI` \| `SWIM` \| `MIXED`), zone (`Z1` \| `Z2` \| `Z3` \| `Z4` \| `Z5` \| `THRESHOLD` \| `COMPROMISED`), duration_seconds, distance_m, avg_hr, max_hr, avg_pace_sec_per_km, avg_power_w, notes |

### Exercises & Hyrox stations (reference data)

| Entity | Purpose | Key fields |
|---|---|---|
| `exercises` | Catalog of movements. Seeded with Polish aliases. | id, slug, name_pl, name_en, aliases (jsonb array), category (`MAIN_LIFT` \| `ACCESSORY` \| `BODYWEIGHT` \| `HYROX_STATION` \| `REHAB`), muscle_groups (jsonb), is_unilateral, default_unit (`REPS` \| `TIME` \| `DISTANCE` \| `CALORIES`), progression_rule_id |
| `progression_rules` | Per-exercise progression model. Discriminated union via `kind`. | id, kind (`TOP_SET_BACKOFF` \| `STRAIGHT_SETS` \| `ENDURANCE_STRENGTH` \| `RPE_CAPPED` \| `QUALITY_FIRST`), config (jsonb — e.g. for TOP_SET_BACKOFF: `{topReps: 5, backoffSets: 2, backoffReps: 5, incrementKg: 2.5}`) |
| `hyrox_stations` | The 8 Hyrox stations with their native units. Seeded. | id, slug, name_pl, name_en, default_reps_or_distance, unit (`METERS` \| `REPS`) |
| `race_results` | Hyrox / running race entry. Seeded with the user's Dec 2025 Poznań debut. | id, athlete_id, event_name, event_date, location, division, total_time_seconds, station_splits (jsonb: per-station times), placement_overall, placement_division, source_url, notes |

### Rehab domain (separate from training)

| Entity | Purpose | Key fields |
|---|---|---|
| `injuries` | An injury or chronic issue. | id, athlete_id, name, body_region, side (`LEFT` \| `RIGHT` \| `BILATERAL`), started_at, resolved_at (nullable), severity_0_10, notes |
| `injury_events` | Timeline of things happening to an injury: ortopeda visit, USG, flare-up. | id, injury_id, occurred_at, kind (`DIAGNOSIS` \| `USG` \| `MRI` \| `ORTHO_VISIT` \| `PHYSIO_VISIT` \| `FLARE_UP` \| `MILESTONE` \| `NOTE`), title, body (TEXT, markdown), attachments (jsonb — links to R2 for USG photos, scans) |
| `medications` | Meds linked to injuries. | id, injury_id, name, dosage, frequency, started_at, ended_at (nullable), notes (e.g., "biofenac + maść 2x dziennie") |
| `rehab_protocols` | Named protocols (Protokół A: Foot/Ankle; Protokół B: VMO). Seeded. | id, slug, name_pl, name_en, description, target_body_regions (jsonb) |
| `rehab_protocol_exercises` | Exercises in a protocol. | id, protocol_id, order_index, exercise_name_pl, sets, reps_or_seconds, equipment, side (`LEFT` \| `RIGHT` \| `BILATERAL`), notes |
| `rehab_sessions` | A rehab session log (not a workout). Links to `sessions` row with type=REHAB but adds protocol context. | id, session_id, protocol_id, completion_pct, post_session_pain_0_10, notes |
| `pain_checkins` | Daily morning pain check-in (or whenever user enters). | id, athlete_id, recorded_at, body_region, side, severity_0_10, context (free text), is_morning |

### Wellness & daily metrics

| Entity | Purpose | Key fields |
|---|---|---|
| `daily_metrics` | Wide row per athlete per day. Aggregated from manual entry or wearable. | athlete_id, day (DATE), sleep_score_0_100, sleep_minutes, hrv_ms, hr_rest_bpm, body_battery, recovery_minutes, training_load_score, mood_1_5, energy_1_5, notes |
| `wearable_syncs` | Audit log of imports. | id, athlete_id, source (`MANUAL_FIT` \| `GARMIN_HEALTH_API` \| `STRAVA` \| `WHOOP` \| `APPLE_HEALTH`), started_at, finished_at, records_inserted, error |
| `weekly_summaries` | AI-generated weekly recap. One per athlete per ISO week. | id, athlete_id, iso_year, iso_week, generated_at, content_md (TEXT, the human-readable summary), strength_progress (jsonb), cardio_volume (jsonb), wellness_avg (jsonb), session_comparisons (jsonb), open_questions (jsonb) |

### Journal (free-form, separate from session reflections)

| Entity | Purpose | Key fields |
|---|---|---|
| `journal_entries` | Free-form notes about health, concerns, observations. Separate from per-session reflection. | id, athlete_id, recorded_at, title, body (TEXT, markdown), tags (jsonb), ai_extracted (jsonb — extracted concerns/decisions/questions for AI context) |

### Goals & planning

| Entity | Purpose | Key fields |
|---|---|---|
| `goals` | Long-term goals. Seeded with the demo athlete's 4 strength RM goals + Hyrox Sub-65'. | id, athlete_id, type (`STRENGTH_RM` \| `RACE_TIME` \| `BODY_COMP` \| `CONSISTENCY`), title, target_value, target_unit, target_date, started_at, achieved_at (nullable), source_note, created_at, updated_at |
| `goal_progress` | Snapshots of progress toward a goal. **Note:** carries `athlete_id` denormalized from `goals.athlete_id` per ADR-0010/0012. | id, athlete_id, goal_id, recorded_at, current_value, distance_to_target, source (`MANUAL` \| `AUTO_FROM_SESSION` \| `AI_ESTIMATE`) |
| `weekly_templates` | Pre-defined week structure (PON/WTO/ŚRO/CZW/PT/SOB/ND × AM/PM). | id, athlete_id, name, active, slots (jsonb: per day_of_week × time_of_day × session_type), created_at, updated_at |
| `template_adherence` | Did each scheduled slot get a session? **Derived/view, not a real table.** Implemented as a SQL VIEW once the UI needs it. | athlete_id, day, slot, scheduled_session_type, actual_session_id (nullable), adherence_status (`MATCH` \| `SUBSTITUTE` \| `SKIP`) |

### Monetization & GDPR (added per ADR-0013)

| Entity | Purpose | Key fields |
|---|---|---|
| `audit_log` | Append-only trail of mutations on sensitive data (injuries, meds, pain, rehab, journal). Required for the physio monetization path; defensive security signal everywhere. | id, athlete_id (nullable for system events), actor_user_id (nullable), action (e.g. `INSERT`/`UPDATE`/`DELETE`/`LOGIN`/`EXPORT`), entity_type (table name), entity_id, before (jsonb), after (jsonb), occurred_at, ip, user_agent |
| `data_export_requests` | GDPR Article 20 — athlete-initiated full data export. Worker builds a zip + signed R2 URL. | id, athlete_id, requested_at, status (`PENDING` \| `READY` \| `EXPIRED`), download_url, expires_at, completed_at |
| `consents` | Tracks each version of terms/privacy/marketing/research/AI-training opt-in per athlete. Records withdrawal as separate event (withdrawn_at set). | id, athlete_id, consent_type, version (e.g. `"v2.0-2026-06"`), accepted_at, withdrawn_at, ip_address |
| `referrals` | Referral mechanic (Hyrox community is community-driven; referrals are the natural growth surface). | id, referrer_athlete_id, referred_email, referred_athlete_id (nullable until signup), created_at, signed_up_at, converted_to_paid_at |

### Observability (added per ADR-0014)

| Entity | Purpose | Key fields |
|---|---|---|
| `ai_usage` | Per-call AI tracking for billing, cost analysis, debugging, and abuse detection. Powers Free-vs-Pro tier limits. Every call to `app/lib/ai/*` inserts a row. | id, athlete_id, provider (`OPENROUTER` \| `ANTHROPIC_DIRECT` \| `OPENAI_DIRECT` \| `DEEPGRAM`), model, prompt_type, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, latency_ms, success, error_code, request_id, created_at |

## Key enums (centralized)

```
SessionType         STRENGTH, HYROX_EMOM, HYROX_AMRAP, HYROX_WORK, CARDIO, COMPROMISED_RUN, REHAB, MOBILITY
SessionSource       MANUAL, IMPORTED
BlockKind           STRAIGHT_SETS, EMOM, AMRAP, WORK_INTERVAL, REST
ExerciseUnit        REPS, TIME, DISTANCE, CALORIES
CardioModality      RUN, BIKE, ROW, SKI, SWIM, MIXED
CardioZone          Z1, Z2, Z3, Z4, Z5, THRESHOLD, COMPROMISED
ExerciseCategory    MAIN_LIFT, ACCESSORY, BODYWEIGHT, HYROX_STATION, REHAB
ProgressionKind     TOP_SET_BACKOFF, STRAIGHT_SETS, ENDURANCE_STRENGTH, RPE_CAPPED, QUALITY_FIRST
HyroxStationSlug    SKI_ERG, SLED_PUSH, SLED_PULL, BURPEE_BROAD_JUMPS, ROWING, FARMERS_CARRY, SANDBAG_LUNGES, WALL_BALLS
HyroxStationUnit    REPS, DISTANCE                       — narrower than ExerciseUnit; Hyrox doesn't use TIME/CALORIES
GoalType            STRENGTH_RM, RACE_TIME, BODY_COMP, CONSISTENCY
GoalProgressSource  MANUAL, AUTO_FROM_SESSION, AI_ESTIMATE
ImportSource        MANUAL_FIT, GARMIN_HEALTH_API, STRAVA, WHOOP, APPLE_HEALTH, MANUAL_ENTRY
InjuryEventKind     DIAGNOSIS, USG, MRI, ORTHO_VISIT, PHYSIO_VISIT, FLARE_UP, MILESTONE, NOTE
CoachRole           PRIMARY, BACKUP, VIEWER, PHYSIO       — PHYSIO added per ADR-0013 (physio monetization path)
Side                LEFT, RIGHT, BILATERAL

# Added per ADR-0013 (monetization)
SubscriptionTier    FREE, PRO, COACH, PHYSIO, CLINIC, LIFETIME
SubscriptionStatus  ACTIVE, CANCELLED, PAST_DUE, TRIAL, NONE
ConsentType         TERMS, PRIVACY, MARKETING, RESEARCH, AI_TRAINING
DataExportStatus    PENDING, READY, EXPIRED

# Added per ADR-0014 (observability)
AiProvider          OPENROUTER, ANTHROPIC_DIRECT, OPENAI_DIRECT, DEEPGRAM
AiPromptType        WEEKLY_SUMMARY, CONVERSATIONAL_LOG, NL_QUERY, VOICE_STRUCTURE, PHOTO_OCR, PLAN_GENERATION, CLASSIFICATION
```

## Seed data (required for MVP)

### Exercises (PL aliases)
At minimum: siady (back squat), martwy (deadlift), klata / ława (bench press), OHP (overhead press), drążek (pull-up), poręcze / dipy (dips), RDL, gorilla rows, bułgary (Bulgarian split squat), wspięcia (calf raises). Each with aliases jsonb so user can type any common form.

### Hyrox stations (8)
SkiErg (1000m), Sled Push (50m), Sled Pull (50m), Burpee Broad Jumps (80m), Rowing (1000m), Farmer's Carry (200m), Sandbag Lunges (100m), Wall Balls (75/100 reps).

### Rehab protocols (2)
- **Protokół A — Foot/Ankle:** mobility, gum band foot adduction (2×12-15, slow eccentric), HSR ball squeeze calf raises (2×20-25), single-leg balance progression (2×45-60s).
- **Protokół B — Knee/VMO:** Patrick step-down (2×12-15 per leg).

### Long-term goals (seeded for the user)
- STRENGTH_RM: deadlift 165 kg @ 3RM, back squat 132 kg @ 3RM, bench 104 kg @ 3RM, OHP 70 kg @ 3RM
- RACE_TIME: Hyrox Sub-65', target_date 2026-10 (Gdańsk)

### Existing race results
- Hyrox Poznań 2025-12 debut — **not in committed seed**; lives in the developer's gitignored `db/seed-personal.local.ts` so the public repo doesn't carry personal race data. See `db/seed-personal.local.example.ts` for the shape.

## What's NOT in P0 schema (deferred)

- `comments` on sessions (P2 social)
- `weekly_summaries.ai_evaluations` (PL eval set — separate table when we build the eval harness)
- `form_check_videos` (Cloudflare Stream — P2)
- `hyresult_raw_html` (R2-backed mirror — P2 scraper)
- `mastra_agent_runs` (multi-agent telemetry — P2/P3)

## Open questions (resolve before first Drizzle migration)

1. **Embeddings table** — single `embeddings(entity_type, entity_id, vector, text)` or per-domain tables? Probably single, vector(1536) for Voyage/OpenAI or vector(3072) for newer models. Decide when AI loop ships.
2. **Are `journal_entries` and `injury_events` close enough to merge into one polymorphic table?** Likely no — different access patterns (journal is athlete-wide search; injury_events are injury-scoped).
3. **Should `pain_checkins` move into `daily_metrics`?** Likely no — pain is per-region with severity and free text, doesn't fit a wide column model.

## References

- ADR-0009 — Hyrox-specific data model + rehab tracking
- ADR-0010 — Multi-tenant schema from day 1
- ADR-0003 — Postgres + Drizzle (still current)
- `/tmp/forge-user-notes.md` (transient, will be archived) — original use case notes captured during audit
