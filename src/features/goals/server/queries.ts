// Server-only query helpers (shared with the dashboard fn). Never import
// from views/routes — must stay out of the client bundle.
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "../../../../db/client";
import { blockMovements, exercises, goals, sets } from "../../../../db/schema";

// Every qualifying REAL set per exercise (non-warmup, weight and reps
// present), one batched query. Goal progress compares actual bar weight at
// the goal's rep count — never an e1RM estimate.
async function loadQualifyingSets(
  athleteId: string,
  exerciseIds: string[],
): Promise<Map<string, { weightKg: number; reps: number }[]>> {
  if (exerciseIds.length === 0) return new Map();
  const rows = await db
    .select({
      exerciseId: blockMovements.exerciseId,
      weightKg: sets.weightKg,
      reps: sets.reps,
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
  const byExercise = new Map<string, { weightKg: number; reps: number }[]>();
  for (const row of rows) {
    if (row.weightKg === null || row.reps === null) continue;
    const arr = byExercise.get(row.exerciseId) ?? [];
    arr.push({ weightKg: row.weightKg, reps: row.reps });
    byExercise.set(row.exerciseId, arr);
  }
  return byExercise;
}

export async function loadActiveGoals(athleteId: string) {
  const rows = await db
    .select({
      id: goals.id,
      type: goals.type,
      title: goals.title,
      targetValue: goals.targetValue,
      targetReps: goals.targetReps,
      targetUnit: goals.targetUnit,
      targetDate: goals.targetDate,
      exerciseId: goals.exerciseId,
      exerciseNamePl: exercises.namePl,
    })
    .from(goals)
    .leftJoin(exercises, eq(goals.exerciseId, exercises.id))
    .where(and(eq(goals.athleteId, athleteId), isNull(goals.achievedAt)))
    .orderBy(sql`${goals.targetDate} ASC NULLS LAST`, goals.createdAt);

  const setsByExercise = await loadQualifyingSets(
    athleteId,
    rows.flatMap((r) => (r.exerciseId ? [r.exerciseId] : [])),
  );
  // A 3RM goal only counts sets of >= 3 reps — the heaviest of those is the
  // current best, in real kilograms.
  return rows.map((r) => {
    const candidates = r.exerciseId ? (setsByExercise.get(r.exerciseId) ?? []) : [];
    let currentBestKg: number | null = null;
    for (const s of candidates) {
      if (s.reps >= r.targetReps && (currentBestKg === null || s.weightKg > currentBestKg)) {
        currentBestKg = s.weightKg;
      }
    }
    return { ...r, currentBestKg };
  });
}

export type ActiveGoal = Awaited<ReturnType<typeof loadActiveGoals>>[number];
