// ============================================================================
// db/seed.ts — Forge catalogue + demo athlete seed (PUBLIC / SAFE TO COMMIT)
//
// Run via: bun run db:seed (requires DATABASE_URL pointing to a migrated DB)
//
// Idempotent. Safe to re-run. Catalogue rows (progression rules, exercises,
// Hyrox stations, rehab protocols) are inserted with ON CONFLICT DO NOTHING
// on their natural keys. Demo athlete rows are SELECT-then-INSERT on natural
// keys (email, username) — so re-running just no-ops.
//
// What goes in here:
//   1. Progression rules (5 kinds × default config)
//   2. Exercises (~32 with Polish aliases)
//   3. Hyrox stations (8 official stations)
//   4. Rehab protocols (Protokół A foot/ankle + Protokół B VMO + exercises)
//   5. Demo athlete (env-overridable, defaults to anonymous placeholder)
//   6. Long-term goals attached to the demo athlete (generic strength targets
//      + Hyrox Sub-65' race time target — same numbers regardless of who runs
//      the seed; edit later via the UI or Drizzle Studio for your personal
//      values).
//
// PERSONAL DATA — race results, real names, real splits — lives in
// `db/seed-personal.local.ts` (gitignored). See `seed-personal.local.example.ts`
// for the shape to copy.
//
// Source of truth: docs/architecture/data-model.md "Seed data" section.
// ============================================================================

import { eq } from "drizzle-orm";
import { db } from "./client";
import {
  athletes,
  exercises,
  goals,
  hyroxStations,
  progressionRules,
  rehabProtocolExercises,
  rehabProtocols,
  users,
} from "./schema";

// ─────────────────────────────────────────────────────────────────────────────
// Demo athlete identity. Env-overrideable so the public repo can ship safe
// placeholders while you keep your real values in `.env` (gitignored).
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_USER_EMAIL = process.env.SEED_DEMO_EMAIL ?? "demo@forge.local";
const DEMO_USER_NAME = process.env.SEED_DEMO_NAME ?? "Demo Athlete";
const DEMO_ATHLETE_USERNAME = process.env.SEED_DEMO_USERNAME ?? "demo-athlete";

// ============================================================================
// 1. PROGRESSION RULES — one canonical default per kind (ADR-0009)
// ============================================================================

const PROGRESSION_RULE_DEFAULTS = [
  {
    kind: "TOP_SET_BACKOFF" as const,
    config: { topReps: 5, backoffSets: 2, backoffReps: 5, incrementKg: 2.5 },
  },
  {
    kind: "STRAIGHT_SETS" as const,
    config: { sets: 3, reps: 8, incrementKg: 2.5 },
  },
  {
    kind: "ENDURANCE_STRENGTH" as const,
    config: { sets: 3, reps: 12, restSec: 60, incrementKg: 1.25 },
  },
  {
    kind: "RPE_CAPPED" as const,
    config: { sets: 3, reps: 8, rpeCap: 8, incrementKg: 1.25 },
  },
  {
    kind: "QUALITY_FIRST" as const,
    config: { sets: 3, reps: 5, focus: "tempo and form, no auto-load increase" },
  },
];

async function seedProgressionRules(): Promise<Map<string, string>> {
  const kindToId = new Map<string, string>();
  const existing = await db.select().from(progressionRules);
  for (const row of existing) kindToId.set(row.kind, row.id);

  for (const def of PROGRESSION_RULE_DEFAULTS) {
    if (kindToId.has(def.kind)) continue;
    const [inserted] = await db.insert(progressionRules).values(def).returning();
    if (inserted) kindToId.set(def.kind, inserted.id);
  }

  console.log(`  progression_rules: ${kindToId.size} rules ready`);
  return kindToId;
}

// ============================================================================
// 2. EXERCISES — Polish-first names with EN parallel; aliases for common slang
// ============================================================================

type ExerciseDef = {
  slug: string;
  namePl: string;
  nameEn: string;
  aliases: string[];
  category: "MAIN_LIFT" | "ACCESSORY" | "BODYWEIGHT" | "HYROX_STATION" | "REHAB";
  muscleGroups: string[];
  isUnilateral?: boolean;
  defaultUnit?: "REPS" | "TIME" | "DISTANCE" | "CALORIES";
  progressionKind?: "TOP_SET_BACKOFF" | "STRAIGHT_SETS" | "ENDURANCE_STRENGTH" | "RPE_CAPPED" | "QUALITY_FIRST";
};

const EXERCISES: ExerciseDef[] = [
  // ── Main lifts ────────────────────────────────────────────────────────────
  {
    slug: "back-squat",
    namePl: "Przysiad ze sztangą",
    nameEn: "Back Squat",
    aliases: ["siady", "przysiady", "back squat", "squat", "BS"],
    category: "MAIN_LIFT",
    muscleGroups: ["quads", "glutes", "lower back"],
    progressionKind: "TOP_SET_BACKOFF",
  },
  {
    slug: "deadlift",
    namePl: "Martwy ciąg",
    nameEn: "Deadlift",
    aliases: ["martwy", "DL", "deadlift", "martwy ciąg"],
    category: "MAIN_LIFT",
    muscleGroups: ["posterior chain", "back", "glutes"],
    progressionKind: "TOP_SET_BACKOFF",
  },
  {
    slug: "bench-press",
    namePl: "Wyciskanie na ławce",
    nameEn: "Bench Press",
    aliases: ["klata", "ława", "bench", "bench press", "BP"],
    category: "MAIN_LIFT",
    muscleGroups: ["chest", "triceps", "front delts"],
    progressionKind: "TOP_SET_BACKOFF",
  },
  {
    slug: "overhead-press",
    namePl: "Wyciskanie nad głowę (OHP)",
    nameEn: "Overhead Press",
    aliases: ["OHP", "wojskowy", "military press", "press"],
    category: "MAIN_LIFT",
    muscleGroups: ["shoulders", "triceps"],
    progressionKind: "TOP_SET_BACKOFF",
  },

  // ── Accessories ───────────────────────────────────────────────────────────
  {
    slug: "romanian-deadlift",
    namePl: "Martwy ciąg rumuński (RDL)",
    nameEn: "Romanian Deadlift",
    aliases: ["RDL", "martwy rumuński", "romanian deadlift"],
    category: "ACCESSORY",
    muscleGroups: ["hamstrings", "glutes", "lower back"],
    progressionKind: "STRAIGHT_SETS",
  },
  {
    slug: "bulgarian-split-squat",
    namePl: "Bułgarskie przysiady",
    nameEn: "Bulgarian Split Squat",
    aliases: ["bułgary", "BSS", "split squat", "bulgarian"],
    category: "ACCESSORY",
    muscleGroups: ["quads", "glutes"],
    isUnilateral: true,
    progressionKind: "STRAIGHT_SETS",
  },
  {
    slug: "hip-thrust",
    namePl: "Hip thrust ze sztangą",
    nameEn: "Hip Thrust",
    aliases: ["hip thrust", "mostek ze sztangą"],
    category: "ACCESSORY",
    muscleGroups: ["glutes"],
    progressionKind: "STRAIGHT_SETS",
  },
  {
    slug: "gorilla-row",
    namePl: "Gorilla rows",
    nameEn: "Gorilla Row",
    aliases: ["gorilla rows", "gorilla", "wioślarz gorilla"],
    category: "ACCESSORY",
    muscleGroups: ["back", "lats"],
    progressionKind: "STRAIGHT_SETS",
  },
  {
    slug: "pendlay-row",
    namePl: "Wioślarz Pendlaya",
    nameEn: "Pendlay Row",
    aliases: ["pendlay row", "pendlay", "wioślarz pendlaya"],
    category: "ACCESSORY",
    muscleGroups: ["back", "lats"],
    progressionKind: "RPE_CAPPED",
  },
  {
    slug: "front-squat",
    namePl: "Przysiad przedni",
    nameEn: "Front Squat",
    aliases: ["front squat", "przysiad przedni", "FS"],
    category: "ACCESSORY",
    muscleGroups: ["quads", "core"],
    progressionKind: "RPE_CAPPED",
  },
  {
    slug: "close-grip-bench",
    namePl: "Wyciskanie wąskim chwytem",
    nameEn: "Close-Grip Bench Press",
    aliases: ["wąskie wyciskanie", "close grip", "CGBP"],
    category: "ACCESSORY",
    muscleGroups: ["triceps", "chest"],
    progressionKind: "RPE_CAPPED",
  },
  {
    slug: "incline-bench",
    namePl: "Wyciskanie na skosie",
    nameEn: "Incline Bench Press",
    aliases: ["incline bench", "skos wyciskanie", "skos"],
    category: "ACCESSORY",
    muscleGroups: ["upper chest", "front delts"],
    progressionKind: "RPE_CAPPED",
  },
  {
    slug: "push-press",
    namePl: "Push press",
    nameEn: "Push Press",
    aliases: ["push press", "wypychanie"],
    category: "ACCESSORY",
    muscleGroups: ["shoulders", "triceps", "legs"],
    progressionKind: "RPE_CAPPED",
  },
  {
    slug: "back-extension",
    namePl: "Prostowniki grzbietu",
    nameEn: "Back Extension",
    aliases: ["prostowniki", "rzymski stół", "back extension", "hyperextension"],
    category: "ACCESSORY",
    muscleGroups: ["lower back", "glutes"],
    progressionKind: "ENDURANCE_STRENGTH",
  },
  {
    slug: "ab-wheel",
    namePl: "Kółko do brzucha (ab wheel)",
    nameEn: "Ab Wheel Rollout",
    aliases: ["kółko", "ab wheel", "ab roller", "koło"],
    category: "ACCESSORY",
    muscleGroups: ["core"],
    progressionKind: "QUALITY_FIRST",
  },

  // ── Bodyweight ────────────────────────────────────────────────────────────
  {
    slug: "pull-up",
    namePl: "Podciąganie na drążku",
    nameEn: "Pull-Up",
    aliases: ["drążek", "podciąganie", "pull up", "pull-up"],
    category: "BODYWEIGHT",
    muscleGroups: ["lats", "back", "biceps"],
    progressionKind: "ENDURANCE_STRENGTH",
  },
  {
    slug: "chin-up",
    namePl: "Podciąganie nachwytem (chin-up)",
    nameEn: "Chin-Up",
    aliases: ["chin up", "chin-up", "drążek nachwytem"],
    category: "BODYWEIGHT",
    muscleGroups: ["biceps", "lats"],
    progressionKind: "ENDURANCE_STRENGTH",
  },
  {
    slug: "dip",
    namePl: "Pompki na poręczach",
    nameEn: "Dip",
    aliases: ["dipy", "dip", "poręcze", "pompki na poręczach"],
    category: "BODYWEIGHT",
    muscleGroups: ["triceps", "chest", "front delts"],
    progressionKind: "ENDURANCE_STRENGTH",
  },
  {
    slug: "push-up",
    namePl: "Pompki",
    nameEn: "Push-Up",
    aliases: ["pompki", "push up", "push-up"],
    category: "BODYWEIGHT",
    muscleGroups: ["chest", "triceps", "core"],
    progressionKind: "ENDURANCE_STRENGTH",
  },
  {
    slug: "burpee",
    namePl: "Burpee",
    nameEn: "Burpee",
    aliases: ["burpee", "burpees"],
    category: "BODYWEIGHT",
    muscleGroups: ["full body"],
    progressionKind: "ENDURANCE_STRENGTH",
  },
  {
    slug: "calf-raise",
    namePl: "Wspięcia na palce (łydki)",
    nameEn: "Calf Raise",
    aliases: ["łydki", "wspięcia", "calf raise", "wspięcia na palce"],
    category: "BODYWEIGHT",
    muscleGroups: ["calves"],
    progressionKind: "ENDURANCE_STRENGTH",
  },

  // ── Hyrox stations (catalogued as exercises so they appear in pickers) ────
  {
    slug: "ski-erg",
    namePl: "SkiErg",
    nameEn: "SkiErg",
    aliases: ["ski erg", "skierg"],
    category: "HYROX_STATION",
    muscleGroups: ["full body", "shoulders", "core"],
    defaultUnit: "DISTANCE",
  },
  {
    slug: "sled-push",
    namePl: "Sled Push (sanie pchanie)",
    nameEn: "Sled Push",
    aliases: ["sled push", "sanki push", "sanie pchanie"],
    category: "HYROX_STATION",
    muscleGroups: ["legs", "glutes"],
    defaultUnit: "DISTANCE",
  },
  {
    slug: "sled-pull",
    namePl: "Sled Pull (sanie ciągnięcie)",
    nameEn: "Sled Pull",
    aliases: ["sled pull", "sanki pull", "sanie ciągnięcie"],
    category: "HYROX_STATION",
    muscleGroups: ["posterior chain", "back"],
    defaultUnit: "DISTANCE",
  },
  {
    slug: "burpee-broad-jump",
    namePl: "Burpee Broad Jumps",
    nameEn: "Burpee Broad Jumps",
    aliases: ["burpee broad jump", "BBJ", "burpees with broad jump"],
    category: "HYROX_STATION",
    muscleGroups: ["full body"],
    defaultUnit: "DISTANCE",
  },
  {
    slug: "rowing",
    namePl: "Wiosła (Rowing)",
    nameEn: "Rowing",
    aliases: ["rowing", "wiosła", "row", "concept2"],
    category: "HYROX_STATION",
    muscleGroups: ["full body", "posterior chain"],
    defaultUnit: "DISTANCE",
  },
  {
    slug: "farmers-carry",
    namePl: "Chód farmera",
    nameEn: "Farmer's Carry",
    aliases: ["farmer carry", "farmers carry", "chód farmera"],
    category: "HYROX_STATION",
    muscleGroups: ["grip", "core", "traps"],
    defaultUnit: "DISTANCE",
  },
  {
    slug: "sandbag-lunges",
    namePl: "Wykroki z workiem (Sandbag Lunges)",
    nameEn: "Sandbag Lunges",
    aliases: ["sandbag lunges", "wykroki z workiem", "sandbag"],
    category: "HYROX_STATION",
    muscleGroups: ["legs", "glutes", "core"],
    isUnilateral: true,
    defaultUnit: "DISTANCE",
  },
  {
    slug: "wall-balls",
    namePl: "Wall Balls",
    nameEn: "Wall Balls",
    aliases: ["wall balls", "WB", "ścianowanie piłką"],
    category: "HYROX_STATION",
    muscleGroups: ["full body", "quads", "shoulders"],
    defaultUnit: "REPS",
  },

  // ── Rehab ─────────────────────────────────────────────────────────────────
  {
    slug: "foot-adduction-gum-band",
    namePl: "Adukcja stopy z gumą",
    nameEn: "Foot Adduction with Gum Band",
    aliases: ["adukcja stopy", "guma stopy", "foot adduction band"],
    category: "REHAB",
    muscleGroups: ["foot", "ankle"],
    isUnilateral: true,
    defaultUnit: "REPS",
  },
  {
    slug: "hsr-ball-squeeze-calf-raise",
    namePl: "HSR Wspięcia na palce z piłką",
    nameEn: "HSR Ball-Squeeze Calf Raise",
    aliases: ["HSR calf raises", "wspięcia HSR", "ball squeeze calf"],
    category: "REHAB",
    muscleGroups: ["calves", "ankle"],
    defaultUnit: "REPS",
  },
  {
    slug: "single-leg-balance",
    namePl: "Balans jednonóż",
    nameEn: "Single-Leg Balance",
    aliases: ["balans jednonóż", "single leg balance", "SLB"],
    category: "REHAB",
    muscleGroups: ["foot", "ankle", "stabilizers"],
    isUnilateral: true,
    defaultUnit: "TIME",
  },
  {
    slug: "patrick-step-down",
    namePl: "Patrick step-down",
    nameEn: "Patrick Step-Down",
    aliases: ["patrick step-down", "step-down patrick", "VMO step-down"],
    category: "REHAB",
    muscleGroups: ["VMO", "quads"],
    isUnilateral: true,
    defaultUnit: "REPS",
  },
];

async function seedExercises(progKindToId: Map<string, string>): Promise<void> {
  const existing = await db.select({ slug: exercises.slug }).from(exercises);
  const existingSlugs = new Set(existing.map((r) => r.slug));

  let inserted = 0;
  for (const def of EXERCISES) {
    if (existingSlugs.has(def.slug)) continue;
    await db.insert(exercises).values({
      slug: def.slug,
      namePl: def.namePl,
      nameEn: def.nameEn,
      aliases: def.aliases,
      category: def.category,
      muscleGroups: def.muscleGroups,
      isUnilateral: def.isUnilateral ?? false,
      defaultUnit: def.defaultUnit ?? "REPS",
      progressionRuleId: def.progressionKind ? (progKindToId.get(def.progressionKind) ?? null) : null,
    });
    inserted++;
  }
  console.log(`  exercises: ${EXERCISES.length} total (${inserted} new this run)`);
}

// ============================================================================
// 3. HYROX STATIONS — the 8 official stations (Men's Open standard distances)
// ============================================================================

const HYROX_STATIONS = [
  {
    slug: "SKI_ERG" as const,
    namePl: "SkiErg",
    nameEn: "SkiErg",
    defaultRepsOrDistance: 1000,
    unit: "DISTANCE" as const,
  },
  {
    slug: "SLED_PUSH" as const,
    namePl: "Sled Push",
    nameEn: "Sled Push",
    defaultRepsOrDistance: 50,
    unit: "DISTANCE" as const,
  },
  {
    slug: "SLED_PULL" as const,
    namePl: "Sled Pull",
    nameEn: "Sled Pull",
    defaultRepsOrDistance: 50,
    unit: "DISTANCE" as const,
  },
  {
    slug: "BURPEE_BROAD_JUMPS" as const,
    namePl: "Burpee Broad Jumps",
    nameEn: "Burpee Broad Jumps",
    defaultRepsOrDistance: 80,
    unit: "DISTANCE" as const,
  },
  {
    slug: "ROWING" as const,
    namePl: "Wiosła",
    nameEn: "Rowing",
    defaultRepsOrDistance: 1000,
    unit: "DISTANCE" as const,
  },
  {
    slug: "FARMERS_CARRY" as const,
    namePl: "Chód farmera",
    nameEn: "Farmer's Carry",
    defaultRepsOrDistance: 200,
    unit: "DISTANCE" as const,
  },
  {
    slug: "SANDBAG_LUNGES" as const,
    namePl: "Wykroki z workiem",
    nameEn: "Sandbag Lunges",
    defaultRepsOrDistance: 100,
    unit: "DISTANCE" as const,
  },
  {
    slug: "WALL_BALLS" as const,
    namePl: "Wall Balls",
    nameEn: "Wall Balls",
    defaultRepsOrDistance: 100,
    unit: "REPS" as const,
  },
];

async function seedHyroxStations(): Promise<void> {
  const existing = await db.select({ slug: hyroxStations.slug }).from(hyroxStations);
  const existingSlugs = new Set(existing.map((r) => r.slug));

  let inserted = 0;
  for (const def of HYROX_STATIONS) {
    if (existingSlugs.has(def.slug)) continue;
    await db.insert(hyroxStations).values(def);
    inserted++;
  }
  console.log(`  hyrox_stations: ${HYROX_STATIONS.length} total (${inserted} new this run)`);
}

// ============================================================================
// 4. REHAB PROTOCOLS — Protokół A (foot/ankle) + Protokół B (VMO)
// ============================================================================

type ProtocolDef = {
  slug: string;
  namePl: string;
  nameEn: string;
  description: string;
  targetBodyRegions: string[];
  exercises: Array<{
    exerciseNamePl: string;
    sets: number;
    repsOrSeconds: string;
    equipment?: string;
    side?: "LEFT" | "RIGHT" | "BILATERAL";
    notes?: string;
  }>;
};

const REHAB_PROTOCOLS: ProtocolDef[] = [
  {
    slug: "protokol-a-foot-ankle",
    namePl: "Protokół A — Stopa / Kostka",
    nameEn: "Protocol A — Foot / Ankle",
    description:
      "Daily foot and ankle rehab block: mobility prep, gum-band foot adduction, HSR calf raises, single-leg balance progression.",
    targetBodyRegions: ["foot", "ankle", "calf"],
    exercises: [
      {
        exerciseNamePl: "Mobilność stopy (rolowanie + dorsiflexion)",
        sets: 1,
        repsOrSeconds: "3-5 min",
        equipment: "piłka, ściana",
        side: "BILATERAL",
        notes: "rozgrzewka",
      },
      {
        exerciseNamePl: "Adukcja stopy z gumą",
        sets: 2,
        repsOrSeconds: "12-15",
        equipment: "guma oporowa",
        side: "BILATERAL",
        notes: "slow eccentric, kontrolowane",
      },
      {
        exerciseNamePl: "HSR wspięcia na palce z piłką między piętami",
        sets: 2,
        repsOrSeconds: "20-25",
        equipment: "piłka, opcjonalnie obciążenie",
        side: "BILATERAL",
        notes: "tempo 3:0:3, ściskanie piłki przez całą serię",
      },
      {
        exerciseNamePl: "Balans jednonóż (progresja: oczy → niestabilność → ruch)",
        sets: 2,
        repsOrSeconds: "45-60s",
        equipment: "opcjonalnie BOSU / poduszka",
        side: "BILATERAL",
        notes: "każda noga osobno",
      },
    ],
  },
  {
    slug: "protokol-b-vmo",
    namePl: "Protokół B — VMO / Kolano",
    nameEn: "Protocol B — VMO / Knee",
    description: "Focused VMO (vastus medialis oblique) activation for knee tracking and patellar stability.",
    targetBodyRegions: ["knee", "VMO", "quads"],
    exercises: [
      {
        exerciseNamePl: "Patrick step-down",
        sets: 2,
        repsOrSeconds: "12-15",
        equipment: "step / podest 15-20cm",
        side: "BILATERAL",
        notes: "tempo 3:1:2, kontrola kolana w linii palca",
      },
    ],
  },
];

async function seedRehabProtocols(): Promise<void> {
  let totalExercises = 0;

  for (const def of REHAB_PROTOCOLS) {
    let [protocol] = await db.select().from(rehabProtocols).where(eq(rehabProtocols.slug, def.slug));

    if (!protocol) {
      [protocol] = await db
        .insert(rehabProtocols)
        .values({
          slug: def.slug,
          namePl: def.namePl,
          nameEn: def.nameEn,
          description: def.description,
          targetBodyRegions: def.targetBodyRegions,
        })
        .returning();
    }

    if (!protocol) throw new Error(`Failed to upsert rehab protocol ${def.slug}`);

    const existingExercises = await db
      .select()
      .from(rehabProtocolExercises)
      .where(eq(rehabProtocolExercises.protocolId, protocol.id));

    if (existingExercises.length === 0) {
      for (let i = 0; i < def.exercises.length; i++) {
        const ex = def.exercises[i];
        if (!ex) continue;
        await db.insert(rehabProtocolExercises).values({
          protocolId: protocol.id,
          orderIndex: i,
          exerciseNamePl: ex.exerciseNamePl,
          sets: ex.sets,
          repsOrSeconds: ex.repsOrSeconds,
          equipment: ex.equipment ?? null,
          side: ex.side ?? null,
          notes: ex.notes ?? null,
        });
        totalExercises++;
      }
    } else {
      totalExercises += existingExercises.length;
    }
  }

  console.log(`  rehab_protocols: ${REHAB_PROTOCOLS.length} protocols, ${totalExercises} exercises total`);
}

// ============================================================================
// 5. DEMO ATHLETE — user + athlete + long-term goals + 2025 race result
// ============================================================================

async function seedDemoAthlete(): Promise<void> {
  // ── User ──
  let [user] = await db.select().from(users).where(eq(users.email, DEMO_USER_EMAIL));
  if (!user) {
    [user] = await db.insert(users).values({ email: DEMO_USER_EMAIL, name: DEMO_USER_NAME }).returning();
  }
  if (!user) throw new Error("Failed to upsert demo user");

  // ── Athlete ──
  let [athlete] = await db.select().from(athletes).where(eq(athletes.username, DEMO_ATHLETE_USERNAME));
  if (!athlete) {
    [athlete] = await db
      .insert(athletes)
      .values({
        userId: user.id,
        username: DEMO_ATHLETE_USERNAME,
        bio: "Hyrox athlete training for Sub-65' Gdańsk 2026-10.",
        locale: "pl",
        timezone: "Europe/Warsaw",
      })
      .returning();
  }
  if (!athlete) throw new Error("Failed to upsert demo athlete");

  // ── Long-term goals (4 strength RM + 1 race time) ──
  const goalDefs = [
    {
      type: "STRENGTH_RM" as const,
      title: "Deadlift 165 kg @ 3RM",
      targetValue: 165,
      targetUnit: "kg",
      sourceNote: "Long-term strength benchmark",
    },
    {
      type: "STRENGTH_RM" as const,
      title: "Back Squat 132 kg @ 3RM",
      targetValue: 132,
      targetUnit: "kg",
      sourceNote: "Long-term strength benchmark",
    },
    {
      type: "STRENGTH_RM" as const,
      title: "Bench Press 104 kg @ 3RM",
      targetValue: 104,
      targetUnit: "kg",
      sourceNote: "Long-term strength benchmark",
    },
    {
      type: "STRENGTH_RM" as const,
      title: "Overhead Press 70 kg @ 3RM",
      targetValue: 70,
      targetUnit: "kg",
      sourceNote: "Long-term strength benchmark",
    },
    {
      type: "RACE_TIME" as const,
      title: "Hyrox Sub-65' — Gdańsk 2026-10",
      targetValue: 65 * 60, // seconds
      targetUnit: "seconds",
      targetDate: "2026-10-01",
      sourceNote: "Primary 2026 race goal",
    },
  ];

  const existingGoals = await db.select({ title: goals.title }).from(goals).where(eq(goals.athleteId, athlete.id));
  const existingGoalTitles = new Set(existingGoals.map((g) => g.title));

  let goalsInserted = 0;
  for (const g of goalDefs) {
    if (existingGoalTitles.has(g.title)) continue;
    await db.insert(goals).values({ athleteId: athlete.id, ...g });
    goalsInserted++;
  }

  console.log(
    `  demo athlete: user=${DEMO_USER_NAME} username=${DEMO_ATHLETE_USERNAME} goals=${goalDefs.length} (${goalsInserted} new)`,
  );
  console.log("  (race results are personal data — seed them via db/seed-personal.local.ts, see .example file)");
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log("Seeding Forge catalogue...");
  const progKindToId = await seedProgressionRules();
  await seedExercises(progKindToId);
  await seedHyroxStations();
  await seedRehabProtocols();
  console.log("Seeding demo athlete...");
  await seedDemoAthlete();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
