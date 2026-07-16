import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { parseInput } from "@/lib/validate";
import { createPool } from "../../../../db/pool";
import { trainingPlanDayExercises, trainingPlanDays } from "../../../../db/schema";
import { PLAN_INTENSITIES } from "../constants";
import { loadTrainingPlan } from "./queries";

export const getTrainingPlan = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  return loadTrainingPlan(athleteId);
});

const upsertPlanDayInput = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    intensity: z.enum(PLAN_INTENSITIES),
    // Empty allowed only for a Rest (free) day; enforced below.
    training: z.string().trim().max(2000),
    goal: z.string().trim().max(500).optional(),
    hasStrength: z.boolean(),
    // Ordered strength exercises; only persisted when hasStrength is true.
    exerciseIds: z.array(z.uuid()).max(30).default([]),
  })
  // A strength session can't be a Rest day.
  .refine((v) => !(v.hasStrength && v.intensity === "RESET"), {
    path: ["intensity"],
    message: "Dzień z sesją siłową nie może być Rest.",
  })
  // Training text required unless it's a Rest day or already has exercises.
  .refine((v) => v.intensity === "RESET" || (v.hasStrength && v.exerciseIds.length > 0) || v.training.length > 0, {
    path: ["training"],
    message: "Trening jest wymagany, chyba że dzień ma ćwiczenia siłowe.",
  });

interface RunUpsertArgs {
  athleteId: string;
  dayOfWeek: number;
  intensity: (typeof PLAN_INTENSITIES)[number];
  training: string;
  goal: string | null;
  hasStrength: boolean;
  exerciseIds: string[];
}

// NOT exported — keeps the pool import out of the client bundle (same reason
// as runCreateSession in strength/server/sessions.ts). Persisting the day +
// its ordered exercise list needs a transaction (upsert parent, replace
// children); the HTTP driver can't hold multi-statement transactions.
async function runUpsertPlanDay(args: RunUpsertArgs): Promise<{ id: string; dayOfWeek: number }> {
  const { db: tx_db, end } = await createPool();
  try {
    return await tx_db.transaction(async (tx) => {
      const [day] = await tx
        .insert(trainingPlanDays)
        .values({
          athleteId: args.athleteId,
          dayOfWeek: args.dayOfWeek,
          intensity: args.intensity,
          training: args.training,
          goal: args.goal,
          hasStrength: args.hasStrength,
        })
        .onConflictDoUpdate({
          target: [trainingPlanDays.athleteId, trainingPlanDays.dayOfWeek],
          set: {
            intensity: args.intensity,
            training: args.training,
            goal: args.goal,
            hasStrength: args.hasStrength,
            updatedAt: new Date(),
          },
        })
        .returning({ id: trainingPlanDays.id, dayOfWeek: trainingPlanDays.dayOfWeek });

      // Replace the ordered exercise list wholesale — simpler and race-free
      // vs diffing. Non-strength day ends up with none.
      await tx.delete(trainingPlanDayExercises).where(eq(trainingPlanDayExercises.planDayId, day.id));
      if (args.hasStrength && args.exerciseIds.length > 0) {
        await tx.insert(trainingPlanDayExercises).values(
          args.exerciseIds.map((exerciseId, orderIndex) => ({
            athleteId: args.athleteId,
            planDayId: day.id,
            orderIndex,
            exerciseId,
          })),
        );
      }
      return day;
    });
  } finally {
    await end();
  }
}

// One row per (athlete, weekday) — editing an existing day must not fail on
// the unique index, hence a true upsert instead of SELECT-then-INSERT.
export const upsertPlanDay = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(upsertPlanDayInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    return runUpsertPlanDay({
      athleteId,
      dayOfWeek: data.dayOfWeek,
      intensity: data.intensity,
      training: data.training,
      goal: data.goal ? data.goal : null,
      hasStrength: data.hasStrength,
      exerciseIds: data.hasStrength ? data.exerciseIds : [],
    });
  });
