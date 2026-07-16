// Server-only query helper (shared with the dashboard fn). Never import
// from views/routes — must stay out of the client bundle.
import { and, asc, eq } from "drizzle-orm";
import { db } from "../../../../db/client";
import { exercises, trainingPlanDayExercises, trainingPlanDays } from "../../../../db/schema";

export async function loadTrainingPlan(athleteId: string) {
  const days = await db
    .select({
      id: trainingPlanDays.id,
      dayOfWeek: trainingPlanDays.dayOfWeek,
      intensity: trainingPlanDays.intensity,
      training: trainingPlanDays.training,
      goal: trainingPlanDays.goal,
      hasStrength: trainingPlanDays.hasStrength,
    })
    .from(trainingPlanDays)
    .where(eq(trainingPlanDays.athleteId, athleteId))
    .orderBy(asc(trainingPlanDays.dayOfWeek));
  if (days.length === 0) return [];

  // Ordered strength exercises for all days in one batched query.
  const exRows = await db
    .select({
      planDayId: trainingPlanDayExercises.planDayId,
      exerciseId: trainingPlanDayExercises.exerciseId,
      namePl: exercises.namePl,
    })
    .from(trainingPlanDayExercises)
    .innerJoin(exercises, eq(trainingPlanDayExercises.exerciseId, exercises.id))
    .where(eq(trainingPlanDayExercises.athleteId, athleteId))
    .orderBy(trainingPlanDayExercises.planDayId, trainingPlanDayExercises.orderIndex);

  const byDay = new Map<string, { exerciseId: string; namePl: string }[]>();
  for (const row of exRows) {
    const arr = byDay.get(row.planDayId) ?? [];
    arr.push({ exerciseId: row.exerciseId, namePl: row.namePl });
    byDay.set(row.planDayId, arr);
  }

  return days.map((day) => ({ ...day, exercises: byDay.get(day.id) ?? [] }));
}

// Ordered exercise ids of a strength plan day for a given weekday — used to
// seed a new session. Empty when that weekday isn't a strength day.
export async function loadPlanDayExerciseIds(athleteId: string, dayOfWeek: number): Promise<string[]> {
  const rows = await db
    .select({ exerciseId: trainingPlanDayExercises.exerciseId })
    .from(trainingPlanDayExercises)
    .innerJoin(trainingPlanDays, eq(trainingPlanDayExercises.planDayId, trainingPlanDays.id))
    .where(
      and(
        eq(trainingPlanDays.athleteId, athleteId),
        eq(trainingPlanDays.dayOfWeek, dayOfWeek),
        eq(trainingPlanDays.hasStrength, true),
      ),
    )
    .orderBy(trainingPlanDayExercises.orderIndex);
  return rows.map((r) => r.exerciseId);
}
