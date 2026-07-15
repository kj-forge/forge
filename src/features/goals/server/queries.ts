// Server-only query helpers (shared with the dashboard fn). Never import
// from views/routes — must stay out of the client bundle.
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { bestE1RM } from "@/features/strength/lib/pr";
import { db } from "../../../../db/client";
import { blockMovements, exercises, goals, sets } from "../../../../db/schema";

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

export type ActiveGoal = Awaited<ReturnType<typeof loadActiveGoals>>[number];
