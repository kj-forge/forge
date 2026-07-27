import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { parseInput } from "@/lib/validate";
import { db } from "../../../../db/client";
import { blockMovements, sets } from "../../../../db/schema";
import { bestSet, isNewPR, type PrCandidate } from "../lib/pr";

const addSetInput = z
  .object({
    blockMovementId: z.uuid(),
    reps: z.int().min(0).max(1000).optional(),
    weightKg: z.number().min(0).max(1000).optional(),
    durationSeconds: z.int().min(1).max(36000).optional(),
    rpe: z.int().min(1).max(10).optional(),
    kind: z.enum(["WARMUP", "TOP_SET", "WORK", "BACK_OFF", "FAILURE", "DROP_SET"]).default("WORK"),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => d.reps !== undefined || d.durationSeconds !== undefined, { message: "Pusta seria." });

// A record is a REAL set (more weight, or same weight × more reps) — never
// an e1RM estimate. previousBest labels the toast ("było 130 × 1").
export type SetPr = { isNewPR: boolean; previousBest: PrCandidate };

export const addSet = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(addSetInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();

    // Verify the block_movement belongs to this athlete.
    const [movement] = await db
      .select({ id: blockMovements.id, exerciseId: blockMovements.exerciseId })
      .from(blockMovements)
      .where(and(eq(blockMovements.id, data.blockMovementId), eq(blockMovements.athleteId, athleteId)))
      .limit(1);
    if (!movement) throw new Error("Nie znaleziono ćwiczenia w tej sesji.");

    // PR check BEFORE the insert, against every set of this exercise ever
    // logged (in-progress session included — beating today's record again
    // is a record again). No previous history = nothing beaten, no toast.
    let pr: SetPr | null = null;
    if (data.kind !== "WARMUP" && data.weightKg !== undefined && data.reps !== undefined && data.reps >= 1) {
      const priorSets = await db
        .select({ weightKg: sets.weightKg, reps: sets.reps, kind: sets.kind })
        .from(sets)
        .innerJoin(blockMovements, eq(sets.blockMovementId, blockMovements.id))
        .where(and(eq(sets.athleteId, athleteId), eq(blockMovements.exerciseId, movement.exerciseId)));
      const previousBest = bestSet(priorSets);
      if (previousBest !== null) {
        pr = { isNewPR: isNewPR({ weightKg: data.weightKg, reps: data.reps }, previousBest), previousBest };
      }
    }

    // Next setNumber for this movement.
    const [{ nextNum }] = await db
      .select({ nextNum: sql<number>`COALESCE(MAX(${sets.setNumber}), 0) + 1` })
      .from(sets)
      .where(and(eq(sets.blockMovementId, data.blockMovementId), eq(sets.athleteId, athleteId)));

    const [row] = await db
      .insert(sets)
      .values({
        athleteId,
        blockMovementId: data.blockMovementId,
        setNumber: nextNum,
        reps: data.reps,
        weightKg: data.weightKg,
        durationSeconds: data.durationSeconds,
        rpe: data.rpe,
        kind: data.kind,
        notes: data.notes,
      })
      .returning();

    return { ...row, pr };
  });

const deleteSetInput = z.object({ setId: z.uuid() });

export const deleteSet = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(deleteSetInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .delete(sets)
      .where(and(eq(sets.id, data.setId), eq(sets.athleteId, athleteId)))
      .returning({ id: sets.id });
    if (!row) throw new Error("Nie znaleziono serii.");
    return row;
  });

const updateSetInput = z
  .object({
    setId: z.uuid(),
    reps: z.int().min(1).max(999).nullable(),
    weightKg: z.number().min(0).max(1000).nullable(),
    durationSeconds: z.int().min(1).max(36000).nullable(),
    rpe: z.int().min(1).max(10).nullable(),
  })
  .refine((d) => d.reps !== null || d.durationSeconds !== null, { message: "Pusta seria." });

// Full replace of the editable fields (the edit modal always sends all four).
// No PR toast on edits — records celebrate only at logging time.
export const updateSet = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(updateSetInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .update(sets)
      .set({ reps: data.reps, weightKg: data.weightKg, durationSeconds: data.durationSeconds, rpe: data.rpe })
      .where(and(eq(sets.id, data.setId), eq(sets.athleteId, athleteId)))
      .returning({ id: sets.id });
    if (!row) throw new Error("Nie znaleziono serii.");
    return row;
  });
