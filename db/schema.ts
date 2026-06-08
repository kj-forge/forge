// ============================================================================
// Forge — Drizzle schema (Postgres)
//
// Single file, ~34 tables grouped by domain. If we cross ~50 tables we'll
// split into db/schema/{auth,sessions,rehab,...}.ts.
//
// Source of truth: docs/architecture/data-model.md
// Decisions:
//   - ADR-0009 — Hyrox-specific data model + rehab tracking
//   - ADR-0010 — Multi-tenant schema from day 1
//   - ADR-0012 — Drizzle conventions (this file's style guide)
//   - ADR-0013 — Monetization-ready schema (locale/tz/subscription/audit/etc.)
//   - ADR-0014 — Observability + LLM gateway (ai_usage table)
//
// Conventions enforced by drizzle.config.ts `casing: "snake_case"`:
//   - camelCase TS keys → snake_case DB columns (do NOT specify column names)
//   - UUID PKs with defaultRandom()
//   - timestamptz for moments in time, date for calendar days
//   - athlete_id NOT NULL on every owned table (multi-tenant invariant)
//   - on delete cascade for athlete's owned data; restrict for catalog refs
//   - jsonb fields typed with $type<>()
//
// Drizzle `relations()` are NOT defined here — they'll land in a follow-up PR
// once the first feature epic actually needs them. Joins use explicit
// `leftJoin`/`innerJoin` for now.
// ============================================================================

import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ============================================================================
// 1. ENUMS
// ============================================================================

export const sessionType = pgEnum("session_type", [
  "STRENGTH",
  "HYROX_EMOM",
  "HYROX_AMRAP",
  "HYROX_WORK",
  "CARDIO",
  "COMPROMISED_RUN",
  "REHAB",
  "MOBILITY",
]);

export const blockKind = pgEnum("block_kind", ["STRAIGHT_SETS", "EMOM", "AMRAP", "WORK_INTERVAL", "REST"]);

export const exerciseUnit = pgEnum("exercise_unit", ["REPS", "TIME", "DISTANCE", "CALORIES"]);

// Hyrox stations use a narrower unit set than general exercises — only reps
// (e.g., Wall Balls, Burpee Broad Jumps counted in reps) or distance (e.g.,
// Sled Push 50m). Time and calories aren't native units for Hyrox stations.
export const hyroxStationUnit = pgEnum("hyrox_station_unit", ["REPS", "DISTANCE"]);

export const cardioModality = pgEnum("cardio_modality", ["RUN", "BIKE", "ROW", "SKI", "SWIM", "MIXED"]);

export const cardioZone = pgEnum("cardio_zone", ["Z1", "Z2", "Z3", "Z4", "Z5", "THRESHOLD", "COMPROMISED"]);

export const exerciseCategory = pgEnum("exercise_category", [
  "MAIN_LIFT",
  "ACCESSORY",
  "BODYWEIGHT",
  "HYROX_STATION",
  "REHAB",
]);

export const progressionKind = pgEnum("progression_kind", [
  "TOP_SET_BACKOFF",
  "STRAIGHT_SETS",
  "ENDURANCE_STRENGTH",
  "RPE_CAPPED",
  "QUALITY_FIRST",
]);

export const hyroxStationSlug = pgEnum("hyrox_station_slug", [
  "SKI_ERG",
  "SLED_PUSH",
  "SLED_PULL",
  "BURPEE_BROAD_JUMPS",
  "ROWING",
  "FARMERS_CARRY",
  "SANDBAG_LUNGES",
  "WALL_BALLS",
]);

export const goalType = pgEnum("goal_type", ["STRENGTH_RM", "RACE_TIME", "BODY_COMP", "CONSISTENCY"]);

export const goalProgressSource = pgEnum("goal_progress_source", ["MANUAL", "AUTO_FROM_SESSION", "AI_ESTIMATE"]);

export const importSource = pgEnum("import_source", [
  "MANUAL_FIT",
  "GARMIN_HEALTH_API",
  "STRAVA",
  "WHOOP",
  "APPLE_HEALTH",
  "MANUAL_ENTRY",
]);

export const sessionSource = pgEnum("session_source", ["MANUAL", "IMPORTED"]);

export const injuryEventKind = pgEnum("injury_event_kind", [
  "DIAGNOSIS",
  "USG",
  "MRI",
  "ORTHO_VISIT",
  "PHYSIO_VISIT",
  "FLARE_UP",
  "MILESTONE",
  "NOTE",
]);

export const side = pgEnum("side", ["LEFT", "RIGHT", "BILATERAL"]);

export const coachRole = pgEnum("coach_role", ["PRIMARY", "BACKUP", "VIEWER", "PHYSIO"]);

export const subscriptionTier = pgEnum("subscription_tier", ["FREE", "PRO", "COACH", "PHYSIO", "CLINIC", "LIFETIME"]);

export const subscriptionStatus = pgEnum("subscription_status", ["ACTIVE", "CANCELLED", "PAST_DUE", "TRIAL", "NONE"]);

export const consentType = pgEnum("consent_type", ["TERMS", "PRIVACY", "MARKETING", "RESEARCH", "AI_TRAINING"]);

export const dataExportStatus = pgEnum("data_export_status", ["PENDING", "READY", "EXPIRED"]);

export const aiProvider = pgEnum("ai_provider", ["OPENROUTER", "ANTHROPIC_DIRECT", "OPENAI_DIRECT", "DEEPGRAM"]);

export const aiPromptType = pgEnum("ai_prompt_type", [
  "WEEKLY_SUMMARY",
  "CONVERSATIONAL_LOG",
  "NL_QUERY",
  "VOICE_STRUCTURE",
  "PHOTO_OCR",
  "PLAN_GENERATION",
  "CLASSIFICATION",
]);

// ============================================================================
// 2. AUTH & IDENTITY
// ============================================================================
// Better Auth manages `users`, `auth_session`, `auth_account`,
// `auth_verification` — see ADR-0015. Better Auth's default model names are
// singular (`user`, `session`, `account`, `verification`); we rename all four
// at the drizzleAdapter via a `schema` mapping in src/lib/auth.ts:
//   user         → users
//   session      → auth_session   (prefixed to avoid colliding with training sessions)
//   account      → auth_account
//   verification → auth_verification
// Plural-DB-name exception is accepted on `auth_*` for parity with the Better
// Auth ecosystem (singular is the upstream norm). The `athletes` table is the
// multi-tenant unit — every owned row references it.
//
// PII columns in this section (auth_session.ipAddress/userAgent, audit_log.ip,
// athletes.lastSeenIp etc.) are nullable and subject to GDPR retention; a
// scheduled purge job is tracked as a follow-up to the observability epic.

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    // No column-level .unique() — uniqueness enforced by named uniqueIndex below
    // to avoid Postgres creating two redundant unique indexes on the same column.
    email: text().notNull(),
    name: text(),
    // Better Auth: true after magic-link click / OAuth (Google auto-verifies).
    emailVerified: boolean().notNull().default(false),
    // Better Auth: avatar URL from OAuth provider; NULL for magic-link-only users.
    image: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

// Active sessions, one row per browser login. Token is HMAC-signed via
// BETTER_AUTH_SECRET and stored in the session cookie. Sessions in DB (not
// JWT-only) so we can revoke, list devices, and "log out everywhere".
// Table prefixed `auth_` to avoid collision with training `sessions`.
export const authSessions = pgTable(
  "auth_session",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // No column-level .unique() — uniqueness enforced by named uniqueIndex below.
    token: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_session_token_idx").on(t.token),
    index("auth_session_user_idx").on(t.userId),
    // Supports future scheduled cleanup of expired sessions without full table scans.
    index("auth_session_expires_idx").on(t.expiresAt),
  ],
);

// Links a user to a provider identity. One user can have many accounts
// (e.g., Google OAuth + magic-link on the same email = 1 user, 2 accounts).
// `password` column is part of Better Auth's default schema; we keep it
// nullable and never populate it (no password auth — magic link only).
export const authAccounts = pgTable(
  "auth_account",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("auth_account_user_idx").on(t.userId),
    uniqueIndex("auth_account_provider_account_idx").on(t.providerId, t.accountId),
  ],
);

// Short-lived verification tokens — magic links, email change, etc.
// `value` stores a hashed token (Better Auth default). One row consumed
// per successful verification (Better Auth deletes after use).
export const authVerifications = pgTable(
  "auth_verification",
  {
    id: uuid().primaryKey().defaultRandom(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("auth_verification_identifier_idx").on(t.identifier),
    // Supports future scheduled cleanup of expired/abandoned magic links.
    index("auth_verification_expires_idx").on(t.expiresAt),
  ],
);

export const athletes = pgTable(
  "athletes",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    username: text().notNull().unique(),
    bio: text(),
    bornAt: date(),
    sex: text(),
    heightCm: doublePrecision(),
    weightKg: doublePrecision(),

    // i18n — see ADR-0013. Polish-first UI, ready for EN/DE expansion.
    locale: text().notNull().default("pl"),
    timezone: text().notNull().default("Europe/Warsaw"),

    // Monetization — see ADR-0013. Defaults to free; flips later when Stripe lands.
    subscriptionTier: subscriptionTier().notNull().default("FREE"),
    subscriptionStatus: subscriptionStatus().notNull().default("NONE"),

    // Security / device fingerprinting — see ADR-0014.
    lastSeenIp: text(),
    lastSeenUserAgent: text(),
    lastLoginAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("athletes_user_idx").on(t.userId), uniqueIndex("athletes_username_idx").on(t.username)],
);

export const coaches = pgTable(
  "coaches",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bio: text(),
    certifications: jsonb().$type<string[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coaches_user_idx").on(t.userId)],
);

export const athleteCoachLinks = pgTable(
  "athlete_coach_links",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    coachId: uuid()
      .notNull()
      .references(() => coaches.id, { onDelete: "cascade" }),
    role: coachRole().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("athlete_coach_links_athlete_idx").on(t.athleteId),
    index("athlete_coach_links_coach_idx").on(t.coachId),
  ],
);

export const athleteFollows = pgTable(
  "athlete_follows",
  {
    id: uuid().primaryKey().defaultRandom(),
    followerAthleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    followedAthleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    since: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("athlete_follows_unique_idx").on(t.followerAthleteId, t.followedAthleteId),
    index("athlete_follows_follower_idx").on(t.followerAthleteId),
    index("athlete_follows_followed_idx").on(t.followedAthleteId),
  ],
);

export const athletePublicProfiles = pgTable(
  "athlete_public_profiles",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" })
      .unique(),
    publicSlug: text().notNull().unique(),
    isPublic: boolean().notNull().default(false),
    displayName: text(),
    displayBio: text(),
    displayAvatarUrl: text(),
    displayRaceResultsPublic: boolean().notNull().default(false),
    displayPrPublic: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("athlete_public_profiles_slug_idx").on(t.publicSlug)],
);

// ============================================================================
// 3. EXERCISES, HYROX STATIONS, PROGRESSION RULES (catalog data)
// ============================================================================
// These are CATALOG tables — no athlete_id. Seeded from db/seed.ts.

export const progressionRules = pgTable("progression_rules", {
  id: uuid().primaryKey().defaultRandom(),
  kind: progressionKind().notNull(),
  // Discriminated union of configs per kind. Example for TOP_SET_BACKOFF:
  //   { topReps: 5, backoffSets: 2, backoffReps: 5, incrementKg: 2.5 }
  config: jsonb().$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const exercises = pgTable(
  "exercises",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    namePl: text().notNull(),
    nameEn: text().notNull(),
    // Aliases: any spelling variations the user might type. PL-first.
    // e.g. ["siady", "przysiady", "back squat", "BS"]
    aliases: jsonb().$type<string[]>().notNull().default([]),
    category: exerciseCategory().notNull(),
    muscleGroups: jsonb().$type<string[]>().notNull().default([]),
    isUnilateral: boolean().notNull().default(false),
    defaultUnit: exerciseUnit().notNull().default("REPS"),
    progressionRuleId: uuid().references(() => progressionRules.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("exercises_slug_idx").on(t.slug), index("exercises_category_idx").on(t.category)],
);

export const hyroxStations = pgTable(
  "hyrox_stations",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: hyroxStationSlug().notNull(),
    namePl: text().notNull(),
    nameEn: text().notNull(),
    defaultRepsOrDistance: integer().notNull(),
    unit: hyroxStationUnit().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("hyrox_stations_slug_idx").on(t.slug)],
);

// ============================================================================
// 4. SESSIONS, BLOCKS, SETS — the core training data
// ============================================================================

export const sessions = pgTable(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    date: date().notNull(),
    startedAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    type: sessionType().notNull(),
    title: text(),
    location: text(),
    notes: text(), // markdown
    source: sessionSource().notNull().default("MANUAL"),
    aiSummary: text(), // markdown — populated by weekly summary job (P1)
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sessions_athlete_date_idx").on(t.athleteId, t.date.desc()),
    index("sessions_athlete_type_idx").on(t.athleteId, t.type),
  ],
);

export const sessionBlocks = pgTable(
  "session_blocks",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Denormalized from sessions.athleteId per ADR-0010 (multi-tenant invariant).
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    orderIndex: integer().notNull(),
    kind: blockKind().notNull(),
    durationSeconds: integer(),
    workSeconds: integer(),
    restSeconds: integer(),
    targetRounds: integer(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("session_blocks_session_idx").on(t.sessionId, t.orderIndex),
    index("session_blocks_athlete_created_idx").on(t.athleteId, t.createdAt.desc()),
  ],
);

export const blockMovements = pgTable(
  "block_movements",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Denormalized from sessions.athleteId per ADR-0010.
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    blockId: uuid()
      .notNull()
      .references(() => sessionBlocks.id, { onDelete: "cascade" }),
    orderIndex: integer().notNull(),
    exerciseId: uuid()
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    targetReps: integer(),
    targetWeightKg: doublePrecision(),
    targetDurationSeconds: integer(),
    targetDistanceM: integer(),
    targetCalories: integer(),
    rpeCap: smallint(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("block_movements_block_idx").on(t.blockId, t.orderIndex),
    index("block_movements_exercise_idx").on(t.exerciseId),
    // Powers "this athlete's progression on this exercise" queries.
    index("block_movements_athlete_exercise_idx").on(t.athleteId, t.exerciseId, t.createdAt.desc()),
  ],
);

export const sets = pgTable(
  "sets",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Denormalized from sessions.athleteId per ADR-0010. This is the densest
    // table in the schema (thousands of rows per athlete-year). The
    // denormalization powers analytics queries without 3-hop joins.
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    blockMovementId: uuid()
      .notNull()
      .references(() => blockMovements.id, { onDelete: "cascade" }),
    setNumber: integer().notNull(),
    reps: integer(),
    weightKg: doublePrecision(),
    durationSeconds: integer(),
    distanceM: integer(),
    calories: integer(),
    rpe: smallint(),
    isWarmup: boolean().notNull().default(false),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sets_movement_idx").on(t.blockMovementId, t.setNumber),
    index("sets_athlete_created_idx").on(t.athleteId, t.createdAt.desc()),
  ],
);

export const cardioSegments = pgTable(
  "cardio_segments",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Denormalized from sessions.athleteId per ADR-0010.
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    orderIndex: integer().notNull(),
    modality: cardioModality().notNull(),
    zone: cardioZone(),
    durationSeconds: integer(),
    distanceM: integer(),
    avgHr: integer(),
    maxHr: integer(),
    avgPaceSecPerKm: integer(),
    avgPowerW: integer(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cardio_segments_session_idx").on(t.sessionId, t.orderIndex),
    index("cardio_segments_athlete_created_idx").on(t.athleteId, t.createdAt.desc()),
  ],
);

export const raceResults = pgTable(
  "race_results",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    eventName: text().notNull(),
    eventDate: date().notNull(),
    location: text(),
    division: text(),
    totalTimeSeconds: integer(),
    // Per-station breakdown for Hyrox: { "SKI_ERG": 245, "SLED_PUSH": 180, ... }
    stationSplits: jsonb().$type<Record<string, number>>().default({}),
    placementOverall: integer(),
    placementDivision: integer(),
    sourceUrl: text(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("race_results_athlete_date_idx").on(t.athleteId, t.eventDate.desc())],
);

// ============================================================================
// 5. REHAB (separate domain — injuries, protocols, sessions, pain)
// ============================================================================

export const injuries = pgTable(
  "injuries",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    name: text().notNull(),
    bodyRegion: text().notNull(),
    side: side(),
    startedAt: date(),
    resolvedAt: date(),
    severity010: smallint(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("injuries_athlete_idx").on(t.athleteId, t.startedAt.desc())],
);

export const injuryEvents = pgTable(
  "injury_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Denormalized from injuries.athleteId per ADR-0010.
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    injuryId: uuid()
      .notNull()
      .references(() => injuries.id, { onDelete: "cascade" }),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    kind: injuryEventKind().notNull(),
    title: text().notNull(),
    body: text(), // markdown
    // Links to R2 / Cloudflare for USG photos, scans, etc.
    // [{ kind: 'image', url: 'r2://...', label: 'USG 2025-12' }]
    attachments: jsonb().$type<Array<{ kind: string; url: string; label: string }>>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("injury_events_injury_idx").on(t.injuryId, t.occurredAt.desc()),
    index("injury_events_athlete_occurred_idx").on(t.athleteId, t.occurredAt.desc()),
  ],
);

export const medications = pgTable(
  "medications",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Denormalized from injuries.athleteId per ADR-0010.
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    injuryId: uuid()
      .notNull()
      .references(() => injuries.id, { onDelete: "cascade" }),
    name: text().notNull(),
    dosage: text(),
    frequency: text(),
    startedAt: date(),
    endedAt: date(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("medications_injury_idx").on(t.injuryId), index("medications_athlete_idx").on(t.athleteId)],
);

export const rehabProtocols = pgTable(
  "rehab_protocols",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull(),
    namePl: text().notNull(),
    nameEn: text().notNull(),
    description: text(),
    targetBodyRegions: jsonb().$type<string[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rehab_protocols_slug_idx").on(t.slug)],
);

export const rehabProtocolExercises = pgTable(
  "rehab_protocol_exercises",
  {
    id: uuid().primaryKey().defaultRandom(),
    protocolId: uuid()
      .notNull()
      .references(() => rehabProtocols.id, { onDelete: "cascade" }),
    orderIndex: integer().notNull(),
    exerciseNamePl: text().notNull(),
    sets: integer(),
    repsOrSeconds: text(), // "2×12-15" / "2×45-60s" — free-form, not parsed
    equipment: text(),
    side: side(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rehab_protocol_exercises_protocol_idx").on(t.protocolId, t.orderIndex)],
);

export const rehabSessions = pgTable(
  "rehab_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Denormalized from sessions.athleteId per ADR-0010.
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" })
      .unique(),
    protocolId: uuid().references(() => rehabProtocols.id, {
      onDelete: "set null",
    }),
    completionPct: smallint(), // 0-100
    postSessionPain010: smallint(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rehab_sessions_protocol_idx").on(t.protocolId), index("rehab_sessions_athlete_idx").on(t.athleteId)],
);

export const painCheckins = pgTable(
  "pain_checkins",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    recordedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    bodyRegion: text().notNull(),
    side: side(),
    severity010: smallint().notNull(),
    context: text(),
    isMorning: boolean().notNull().default(false),
  },
  (t) => [index("pain_checkins_athlete_recorded_idx").on(t.athleteId, t.recordedAt.desc())],
);

// ============================================================================
// 6. WELLNESS, WEARABLES, WEEKLY SUMMARIES, JOURNAL
// ============================================================================

// Composite PK (athlete_id, day) — one row per athlete per calendar day.
// No surrogate UUID needed; the natural key is the meaningful one here.
export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    day: date().notNull(),
    sleepScore0100: smallint(),
    sleepMinutes: integer(),
    hrvMs: integer(),
    hrRestBpm: smallint(),
    bodyBattery: smallint(),
    recoveryMinutes: integer(),
    trainingLoadScore: doublePrecision(),
    mood15: smallint(),
    energy15: smallint(),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.athleteId, t.day] }),
    index("daily_metrics_athlete_day_idx").on(t.athleteId, t.day.desc()),
  ],
);

export const wearableSyncs = pgTable(
  "wearable_syncs",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    source: importSource().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
    recordsInserted: integer().notNull().default(0),
    error: text(),
  },
  (t) => [index("wearable_syncs_athlete_started_idx").on(t.athleteId, t.startedAt.desc())],
);

export const weeklySummaries = pgTable(
  "weekly_summaries",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    isoYear: integer().notNull(),
    isoWeek: integer().notNull(),
    generatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    contentMd: text().notNull(),
    strengthProgress: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    cardioVolume: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    wellnessAvg: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    sessionComparisons: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    openQuestions: jsonb().$type<string[]>().notNull().default([]),
  },
  (t) => [uniqueIndex("weekly_summaries_athlete_week_idx").on(t.athleteId, t.isoYear, t.isoWeek)],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    recordedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    title: text(),
    body: text().notNull(), // markdown
    tags: jsonb().$type<string[]>().notNull().default([]),
    // AI-extracted insights (concerns/decisions/questions) — populated by AI epic.
    aiExtracted: jsonb().$type<Record<string, unknown>>().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("journal_entries_athlete_recorded_idx").on(t.athleteId, t.recordedAt.desc())],
);

// ============================================================================
// 7. GOALS & PLANNING
// ============================================================================

export const goals = pgTable(
  "goals",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    type: goalType().notNull(),
    title: text().notNull(),
    targetValue: doublePrecision(),
    targetUnit: text(),
    targetDate: date(),
    startedAt: date(),
    achievedAt: date(),
    sourceNote: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("goals_athlete_type_idx").on(t.athleteId, t.type)],
);

export const goalProgress = pgTable(
  "goal_progress",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Denormalized from goals.athleteId per ADR-0010.
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    goalId: uuid()
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    recordedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    currentValue: doublePrecision().notNull(),
    distanceToTarget: doublePrecision(),
    source: goalProgressSource().notNull().default("MANUAL"),
  },
  (t) => [
    index("goal_progress_goal_recorded_idx").on(t.goalId, t.recordedAt.desc()),
    index("goal_progress_athlete_recorded_idx").on(t.athleteId, t.recordedAt.desc()),
  ],
);

export const weeklyTemplates = pgTable(
  "weekly_templates",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    name: text().notNull(),
    active: boolean().notNull().default(false),
    // [{ dayOfWeek: 'MON', timeOfDay: 'AM', sessionType: 'HYROX_WORK' }, …]
    slots: jsonb()
      .$type<
        Array<{
          dayOfWeek: string;
          timeOfDay: string;
          sessionType: string;
        }>
      >()
      .notNull()
      .default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("weekly_templates_athlete_idx").on(t.athleteId)],
);

// `template_adherence` from data-model.md is a derived view, not a table.
// Will be implemented as a SQL VIEW once the UI needs it.

// ============================================================================
// 8. MONETIZATION & GDPR (ADR-0013)
// ============================================================================

// Append-only audit trail for sensitive data changes (injuries, meds,
// pain_checkins, rehab_sessions, journal_entries, etc.). Required for the
// physio path (P2+) and as a defence-in-depth security signal.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid().references(() => athletes.id, { onDelete: "set null" }),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(), // INSERT | UPDATE | DELETE | LOGIN | EXPORT …
    entityType: text().notNull(), // table name
    entityId: uuid(),
    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [
    index("audit_log_athlete_occurred_idx").on(t.athleteId, t.occurredAt.desc()),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
  ],
);

// GDPR Article 20 — data portability. Athlete requests full export of their
// data; we generate a zip + signed URL, store reference here.
export const dataExportRequests = pgTable(
  "data_export_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    requestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    status: dataExportStatus().notNull().default("PENDING"),
    downloadUrl: text(),
    expiresAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("data_export_requests_athlete_idx").on(t.athleteId, t.requestedAt.desc())],
);

// Consent records — each version of terms/privacy/marketing/etc. that the
// athlete has accepted. Withdrawal is a separate event (withdrawnAt set).
export const consents = pgTable(
  "consents",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    consentType: consentType().notNull(),
    version: text().notNull(), // "v1.0", "v2.0-2026-06" — track which copy was accepted
    acceptedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp({ withTimezone: true }),
    ipAddress: text(),
  },
  (t) => [index("consents_athlete_type_idx").on(t.athleteId, t.consentType)],
);

// Referral mechanic — track who invited whom. Pre-launch is harmless; later
// drives growth + potential rewards.
export const referrals = pgTable(
  "referrals",
  {
    id: uuid().primaryKey().defaultRandom(),
    referrerAthleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    referredEmail: text().notNull(),
    referredAthleteId: uuid().references(() => athletes.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    signedUpAt: timestamp({ withTimezone: true }),
    convertedToPaidAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("referrals_referrer_idx").on(t.referrerAthleteId), index("referrals_email_idx").on(t.referredEmail)],
);

// ============================================================================
// 9. OBSERVABILITY — AI USAGE (ADR-0014)
// ============================================================================
// Per-call AI tracking for billing logic (Free vs Pro limits), cost analysis,
// debugging, and abuse detection. See ADR-0014 — we use OpenRouter as the
// primary LLM gateway; this table is the per-end-user attribution layer that
// OpenRouter's dashboard doesn't replace (their dashboard is per-API-key).

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid().primaryKey().defaultRandom(),
    athleteId: uuid()
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    provider: aiProvider().notNull().default("OPENROUTER"),
    model: text().notNull(), // e.g. "anthropic/claude-opus-4-7"
    promptType: aiPromptType().notNull(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    cacheReadTokens: integer().notNull().default(0),
    cacheWriteTokens: integer().notNull().default(0),
    costUsd: doublePrecision().notNull().default(0),
    latencyMs: integer().notNull().default(0),
    success: boolean().notNull().default(true),
    errorCode: text(),
    requestId: text(), // OpenRouter / Anthropic request id for cross-referencing
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_athlete_created_idx").on(t.athleteId, t.createdAt.desc()),
    index("ai_usage_model_idx").on(t.model),
    index("ai_usage_request_idx").on(t.requestId),
  ],
);
