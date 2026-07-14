import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { db } from "../../../../db/client";
import { blockMovements, exercises, sessionBlocks, sessions, sets } from "../../../../db/schema";
import { ACCESSORY_SLUGS, LOADED_BW_SLUGS, PR_TABLE_SLUG_ORDER } from "../constants";
import { epleyE1RM } from "../lib/e1rm";

export type PrTableRow = {
  exerciseId: string;
  slug: string;
  namePl: string;
  isMainLift: boolean;
  best: { weightKg: number; reps: number; e1rm: number | null; date: string } | null;
};

const prTableInput = z.object({ includeAccessories: z.boolean() });

const slugOrder = (slug: string) => {
  const idx = PR_TABLE_SLUG_ORDER.indexOf(slug as (typeof PR_TABLE_SLUG_ORDER)[number]);
  return idx === -1 ? PR_TABLE_SLUG_ORDER.length : idx;
};

// All-time bests for the main lifts (and optionally the accessory group):
// heaviest qualifying set per exercise plus its Epley e1RM and the date it
// was FIRST achieved. Two batched queries regardless of exercise count.
export const getPrTable = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => prTableInput.parse(data))
  .handler(async ({ data }): Promise<PrTableRow[]> => {
    const { athleteId } = await getCurrentAthleteOrThrow();

    const scope = data.includeAccessories
      ? or(eq(exercises.isMainLift, true), inArray(exercises.slug, [...ACCESSORY_SLUGS]))
      : eq(exercises.isMainLift, true);
    const exerciseRows = await db
      .select({
        exerciseId: exercises.id,
        slug: exercises.slug,
        namePl: exercises.namePl,
        isMainLift: exercises.isMainLift,
      })
      .from(exercises)
      .where(scope);
    if (exerciseRows.length === 0) return [];

    // Ordered by date so a tie on weight+reps keeps the FIRST achievement —
    // that is the record's date, later repeats don't move it.
    const setRows = await db
      .select({
        exerciseId: blockMovements.exerciseId,
        weightKg: sets.weightKg,
        reps: sets.reps,
        date: sessions.date,
      })
      .from(sets)
      .innerJoin(blockMovements, eq(sets.blockMovementId, blockMovements.id))
      .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
      .innerJoin(sessions, eq(sessionBlocks.sessionId, sessions.id))
      .where(
        and(
          eq(sets.athleteId, athleteId),
          isNotNull(sessions.endedAt),
          inArray(
            blockMovements.exerciseId,
            exerciseRows.map((e) => e.exerciseId),
          ),
          ne(sets.kind, "WARMUP"),
          isNotNull(sets.weightKg),
          isNotNull(sets.reps),
        ),
      )
      .orderBy(sessions.date, sessions.startedAt);

    const bestByExercise = new Map<string, { weightKg: number; reps: number; date: string }>();
    for (const row of setRows) {
      if (row.weightKg === null || row.reps === null) continue;
      const cur = bestByExercise.get(row.exerciseId);
      const better = !cur || row.weightKg > cur.weightKg || (row.weightKg === cur.weightKg && row.reps > cur.reps);
      if (better) bestByExercise.set(row.exerciseId, { weightKg: row.weightKg, reps: row.reps, date: row.date });
    }

    return exerciseRows
      .sort((a, b) => slugOrder(a.slug) - slugOrder(b.slug))
      .map((e) => {
        const best = bestByExercise.get(e.exerciseId) ?? null;
        const isLoadedBw = (LOADED_BW_SLUGS as readonly string[]).includes(e.slug);
        return {
          ...e,
          best: best ? { ...best, e1rm: isLoadedBw ? null : epleyE1RM(best.weightKg, best.reps) } : null,
        };
      });
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
