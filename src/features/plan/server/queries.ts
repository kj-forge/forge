// Server-only query helper (shared with the dashboard fn). Never import
// from views/routes — must stay out of the client bundle.
import { asc, eq } from "drizzle-orm";
import { db } from "../../../../db/client";
import { trainingPlanDays } from "../../../../db/schema";

export async function loadTrainingPlan(athleteId: string) {
  return db
    .select({
      id: trainingPlanDays.id,
      dayOfWeek: trainingPlanDays.dayOfWeek,
      intensity: trainingPlanDays.intensity,
      training: trainingPlanDays.training,
      goal: trainingPlanDays.goal,
    })
    .from(trainingPlanDays)
    .where(eq(trainingPlanDays.athleteId, athleteId))
    .orderBy(asc(trainingPlanDays.dayOfWeek));
}
