// ============================================================================
// db/seed-personal.local.example.ts — TEMPLATE for personal seed data
//
// 1. Copy this file to `db/seed-personal.local.ts` (gitignored — your real
//    values stay on your machine, never committed to the public repo).
// 2. Fill in your race results, PRs, personal goals, etc.
// 3. Run with: `bun run db/seed-personal.local.ts`
//
// Idempotent — checks for existing rows on natural keys before inserting.
// Re-running is safe.
//
// This file is intentionally separate from `db/seed.ts` because the public
// catalogue seed must be portable across any developer cloning the repo,
// while personal race results / PRs / detailed notes are private.
// ============================================================================

import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { athletes, raceResults, users } from "./schema";

// Match this to whatever you set in `.env` for SEED_DEMO_*.
const DEMO_USER_EMAIL = process.env.SEED_DEMO_EMAIL ?? "demo@forge.local";

// ─────────────────────────────────────────────────────────────────────────────
// Race results — placeholder example. Replace with your real splits.
//
// stationSplits is a JSON object keyed by either a Hyrox station slug
// (SKI_ERG, SLED_PUSH, …) or RUN_1..RUN_8 for the 1km runs between stations.
// All values are seconds.
// ─────────────────────────────────────────────────────────────────────────────

const RACE_RESULTS = [
  {
    eventName: "Hyrox <Your City>",
    eventDate: "2025-12-13", // YYYY-MM-DD
    location: "<City>, <Country>",
    division: "Men's Open", // or "Women's Open" | "Men's Pro" | "Doubles" | …
    totalTimeSeconds: 0, // sum of all 16 segments (8 runs + 8 stations)
    stationSplits: {
      RUN_1: 0,
      SKI_ERG: 0,
      RUN_2: 0,
      SLED_PUSH: 0,
      RUN_3: 0,
      SLED_PULL: 0,
      RUN_4: 0,
      BURPEE_BROAD_JUMPS: 0,
      RUN_5: 0,
      ROWING: 0,
      RUN_6: 0,
      FARMERS_CARRY: 0,
      RUN_7: 0,
      SANDBAG_LUNGES: 0,
      RUN_8: 0,
      WALL_BALLS: 0,
    },
    placementOverall: null as number | null,
    placementDivision: null as number | null,
    sourceUrl: null as string | null, // e.g., "https://www.hyresult.com/athlete/..."
    notes: null as string | null,
  },
];

async function main(): Promise<void> {
  // Find the user → athlete by email (set in db/seed.ts run).
  const [user] = await db.select().from(users).where(eq(users.email, DEMO_USER_EMAIL));
  if (!user) {
    throw new Error(`User ${DEMO_USER_EMAIL} not found. Run \`bun run db:seed\` first to create the demo athlete.`);
  }
  const [athlete] = await db.select().from(athletes).where(eq(athletes.userId, user.id));
  if (!athlete) {
    throw new Error(`Athlete for user ${DEMO_USER_EMAIL} not found. Run \`bun run db:seed\` first.`);
  }

  let inserted = 0;
  for (const r of RACE_RESULTS) {
    const [existing] = await db
      .select()
      .from(raceResults)
      .where(
        and(
          eq(raceResults.athleteId, athlete.id),
          eq(raceResults.eventName, r.eventName),
          eq(raceResults.eventDate, r.eventDate),
        ),
      );
    if (existing) continue;

    await db.insert(raceResults).values({
      athleteId: athlete.id,
      eventName: r.eventName,
      eventDate: r.eventDate,
      location: r.location,
      division: r.division,
      totalTimeSeconds: r.totalTimeSeconds,
      stationSplits: r.stationSplits,
      placementOverall: r.placementOverall,
      placementDivision: r.placementDivision,
      sourceUrl: r.sourceUrl,
      notes: r.notes,
    });
    inserted++;
  }

  console.log(`Personal seed: ${RACE_RESULTS.length} race results (${inserted} new this run).`);
}

main().catch((err) => {
  console.error("Personal seed failed:", err);
  process.exit(1);
});
