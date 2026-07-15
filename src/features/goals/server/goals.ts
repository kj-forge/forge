import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { db } from "../../../../db/client";
import { goals } from "../../../../db/schema";
import { GOAL_TYPES } from "../constants";
import { loadActiveGoals } from "./queries";

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
