import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { parseInput } from "@/lib/validate";
import { db } from "../../../../db/client";
import { exercises, goals } from "../../../../db/schema";
import { GOAL_TYPES } from "../constants";
import { loadActiveGoals } from "./queries";

export const listGoals = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  return loadActiveGoals(athleteId);
});

const upsertGoalInput = z.object({
  id: z.uuid().optional(),
  type: z.enum(GOAL_TYPES),
  // Optional because STRENGTH_RM composes its title from the exercise.
  title: z.string().trim().max(120).optional(),
  targetValue: z.number().positive().optional(),
  targetReps: z.number().int().min(1).max(50).optional(),
  targetUnit: z.string().trim().max(10).optional(),
  targetDate: z.iso.date().optional(),
  exerciseId: z.uuid().optional(),
});

export const upsertGoal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(upsertGoalInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();

    // Strength goals: the exercise IS the goal — title mirrors its name and
    // the unit is always lowercase kg (phone keyboards love typing "Kg").
    let title = data.title ?? "";
    let targetUnit = data.targetUnit || null;
    if (targetUnit && /^kg$/i.test(targetUnit)) targetUnit = "kg";
    if (data.type === "STRENGTH_RM") {
      if (!data.exerciseId) throw new Error("Cel siłowy wymaga ćwiczenia.");
      const [exercise] = await db
        .select({ namePl: exercises.namePl })
        .from(exercises)
        .where(and(eq(exercises.id, data.exerciseId), eq(exercises.athleteId, athleteId)))
        .limit(1);
      if (!exercise) throw new Error("Nie znaleziono ćwiczenia.");
      title = exercise.namePl;
      targetUnit = "kg";
    } else if (title.length === 0) {
      throw new Error("Podaj tytuł celu.");
    }

    const values = {
      type: data.type,
      title,
      targetValue: data.targetValue ?? null,
      // Rep targets only mean something on a lift goal; others stay at 1.
      targetReps: data.type === "STRENGTH_RM" ? (data.targetReps ?? 1) : 1,
      targetUnit,
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
  .inputValidator((data: unknown) => parseInput(deleteGoalInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .delete(goals)
      .where(and(eq(goals.id, data.goalId), eq(goals.athleteId, athleteId)))
      .returning({ id: goals.id });
    if (!row) throw new Error("Nie znaleziono celu.");
    return row;
  });
