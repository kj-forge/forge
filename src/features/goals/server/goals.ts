import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { bestE1RM } from "@/features/strength/lib/pr";
import { db } from "../../../../db/client";
import { blockMovements, exercises, goals, sets } from "../../../../db/schema";
import { GOAL_TYPES } from "../constants";

// Best-ever e1RM per exercise, one batched query — feeds the auto progress
// of STRENGTH_RM goals (and the dashboard's goal tile).
export async function loadCurrentE1rms(athleteId: string, exerciseIds: string[]): Promise<Map<string, number>> {
  if (exerciseIds.length === 0) return new Map();
  const rows = await db
    .select({
      exerciseId: blockMovements.exerciseId,
      weightKg: sets.weightKg,
      reps: sets.reps,
      kind: sets.kind,
    })
    .from(sets)
    .innerJoin(blockMovements, eq(sets.blockMovementId, blockMovements.id))
    .where(
      and(
        eq(sets.athleteId, athleteId),
        inArray(blockMovements.exerciseId, exerciseIds),
        ne(sets.kind, "WARMUP"),
        isNotNull(sets.weightKg),
        isNotNull(sets.reps),
      ),
    );
  const byExercise = new Map<string, typeof rows>();
  for (const row of rows) {
    const arr = byExercise.get(row.exerciseId) ?? [];
    arr.push(row);
    byExercise.set(row.exerciseId, arr);
  }
  const result = new Map<string, number>();
  for (const [exerciseId, exerciseSets] of byExercise) {
    const best = bestE1RM(exerciseSets);
    if (best !== null) result.set(exerciseId, best);
  }
  return result;
}

export async function loadActiveGoals(athleteId: string) {
  const rows = await db
    .select({
      id: goals.id,
      type: goals.type,
      title: goals.title,
      targetValue: goals.targetValue,
      targetUnit: goals.targetUnit,
      targetDate: goals.targetDate,
      exerciseId: goals.exerciseId,
      exerciseNamePl: exercises.namePl,
    })
    .from(goals)
    .leftJoin(exercises, eq(goals.exerciseId, exercises.id))
    .where(and(eq(goals.athleteId, athleteId), isNull(goals.achievedAt)))
    .orderBy(sql`${goals.targetDate} ASC NULLS LAST`, goals.createdAt);

  const e1rms = await loadCurrentE1rms(
    athleteId,
    rows.flatMap((r) => (r.exerciseId ? [r.exerciseId] : [])),
  );
  return rows.map((r) => ({
    ...r,
    currentE1rm: r.exerciseId ? (e1rms.get(r.exerciseId) ?? null) : null,
  }));
}

export const listGoals = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  return loadActiveGoals(athleteId);
});

const upsertGoalInput = z.object({
  id: z.uuid().optional(),
  type: z.enum(GOAL_TYPES),
  title: z.string().trim().min(1).max(120),
  targetValue: z.number().positive().optional(),
  targetUnit: z.string().trim().max(10).optional(),
  targetDate: z.iso.date().optional(),
  exerciseId: z.uuid().optional(),
});

export const upsertGoal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertGoalInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const values = {
      type: data.type,
      title: data.title,
      targetValue: data.targetValue ?? null,
      targetUnit: data.targetUnit || null,
      targetDate: data.targetDate ?? null,
      // Only STRENGTH_RM goals track a lift; scrub stale links on type change.
      exerciseId: data.type === "STRENGTH_RM" ? (data.exerciseId ?? null) : null,
    };
    if (data.id) {
      const [row] = await db
        .update(goals)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(goals.id, data.id), eq(goals.athleteId, athleteId)))
        .returning({ id: goals.id });
      if (!row) throw new Error("Nie znaleziono celu.");
      return row;
    }
    const [row] = await db
      .insert(goals)
      .values({ athleteId, startedAt: sql`now()::date`, ...values })
      .returning({ id: goals.id });
    return row;
  });

const deleteGoalInput = z.object({ goalId: z.uuid() });

export const deleteGoal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteGoalInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .delete(goals)
      .where(and(eq(goals.id, data.goalId), eq(goals.athleteId, athleteId)))
      .returning({ id: goals.id });
    if (!row) throw new Error("Nie znaleziono celu.");
    return row;
  });
