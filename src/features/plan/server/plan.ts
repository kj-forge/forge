import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { db } from "../../../../db/client";
import { trainingPlanDays } from "../../../../db/schema";
import { PLAN_INTENSITIES } from "../constants";
import { loadTrainingPlan } from "./queries";

export const getTrainingPlan = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  return loadTrainingPlan(athleteId);
});

const upsertPlanDayInput = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  intensity: z.enum(PLAN_INTENSITIES),
  training: z.string().trim().min(1).max(2000),
  goal: z.string().trim().max(500).optional(),
});

// One row per (athlete, weekday) — editing an existing day must not fail on
// the unique index, hence a true upsert instead of SELECT-then-INSERT.
export const upsertPlanDay = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertPlanDayInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const goal = data.goal ? data.goal : null;
    const [row] = await db
      .insert(trainingPlanDays)
      .values({
        athleteId,
        dayOfWeek: data.dayOfWeek,
        intensity: data.intensity,
        training: data.training,
        goal,
      })
      .onConflictDoUpdate({
        target: [trainingPlanDays.athleteId, trainingPlanDays.dayOfWeek],
        set: { intensity: data.intensity, training: data.training, goal, updatedAt: new Date() },
      })
      .returning({ id: trainingPlanDays.id, dayOfWeek: trainingPlanDays.dayOfWeek });
    return row;
  });
