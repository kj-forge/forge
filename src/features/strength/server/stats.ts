import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { db } from "../../../../db/client";
import { blockMovements, exercises, sessionBlocks, sessions, sets } from "../../../../db/schema";
import { loadExerciseStats, loadPrTable } from "./queries";

export type { PrTableRow } from "./queries";

const exerciseStatsInput = z.object({ slug: z.string().trim().min(1).max(80) });

export const getExerciseStats = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => exerciseStatsInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    return loadExerciseStats(athleteId, data.slug);
  });

const prTableInput = z.object({ includeAccessories: z.boolean() });

// All-time bests for the main lifts (and optionally the accessory group) —
// batched query logic shared with the dashboard lives in queries.ts.
export const getPrTable = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => prTableInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    return loadPrTable(athleteId, data.includeAccessories);
  });

export type WeekdaySession = {
  sessionId: string;
  date: string;
  exercises: {
    namePl: string;
    slug: string;
    sets: { weightKg: number | null; reps: number | null; kind: string }[];
  }[];
};

// 0 = poniedziałek … 6 = niedziela (matches the PON–ND day chips).
const weekdayInput = z.object({ weekday: z.number().int().min(0).max(6) });

// Every ended session of the chosen weekday from the last 2 months that has
// at least one exercise, newest first, with full set lists per exercise.
// The matrix pivot (exercise rows × session columns) happens client-side.
export const getWeekdayComparison = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => weekdayInput.parse(data))
  .handler(async ({ data }): Promise<WeekdaySession[]> => {
    const { athleteId } = await getCurrentAthleteOrThrow();

    const floor = new Date();
    floor.setMonth(floor.getMonth() - 2);
    const floorDate = floor.toISOString().slice(0, 10);

    // Postgres ISODOW: 1 = Monday … 7 = Sunday.
    const sessionRows = await db
      .select({ sessionId: sessions.id, date: sessions.date })
      .from(sessions)
      .innerJoin(sessionBlocks, eq(sessionBlocks.sessionId, sessions.id))
      .innerJoin(blockMovements, eq(blockMovements.blockId, sessionBlocks.id))
      .where(
        and(
          eq(sessions.athleteId, athleteId),
          isNotNull(sessions.endedAt),
          gte(sessions.date, floorDate),
          sql`extract(isodow from ${sessions.date}) = ${data.weekday + 1}`,
        ),
      )
      .groupBy(sessions.id, sessions.date)
      .orderBy(desc(sessions.date), desc(sessions.id));
    if (sessionRows.length === 0) return [];

    const ids = sessionRows.map((s) => s.sessionId);
    const movementRows = await db
      .select({
        sessionId: sessionBlocks.sessionId,
        movementId: blockMovements.id,
        namePl: exercises.namePl,
        slug: exercises.slug,
      })
      .from(blockMovements)
      .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
      .innerJoin(exercises, eq(blockMovements.exerciseId, exercises.id))
      .where(and(eq(blockMovements.athleteId, athleteId), inArray(sessionBlocks.sessionId, ids)))
      .orderBy(sessionBlocks.sessionId, blockMovements.orderIndex);

    const setRows = await db
      .select({
        blockMovementId: sets.blockMovementId,
        weightKg: sets.weightKg,
        reps: sets.reps,
        kind: sets.kind,
      })
      .from(sets)
      .innerJoin(blockMovements, eq(sets.blockMovementId, blockMovements.id))
      .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
      .where(and(eq(sets.athleteId, athleteId), inArray(sessionBlocks.sessionId, ids)))
      .orderBy(sets.blockMovementId, sets.setNumber);

    const setsByMovement = new Map<string, WeekdaySession["exercises"][number]["sets"]>();
    for (const row of setRows) {
      const arr = setsByMovement.get(row.blockMovementId) ?? [];
      arr.push({ weightKg: row.weightKg, reps: row.reps, kind: row.kind });
      setsByMovement.set(row.blockMovementId, arr);
    }

    const movementsBySession = new Map<string, WeekdaySession["exercises"]>();
    for (const row of movementRows) {
      const arr = movementsBySession.get(row.sessionId) ?? [];
      arr.push({ namePl: row.namePl, slug: row.slug, sets: setsByMovement.get(row.movementId) ?? [] });
      movementsBySession.set(row.sessionId, arr);
    }

    return sessionRows.map((s) => ({
      sessionId: s.sessionId,
      date: s.date,
      exercises: movementsBySession.get(s.sessionId) ?? [],
    }));
  });
