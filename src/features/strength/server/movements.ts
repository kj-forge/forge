import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { parseInput } from "@/lib/validate";
import { db } from "../../../../db/client";
import { createPool } from "../../../../db/pool";
import { blockMovements, sessionBlocks, sets } from "../../../../db/schema";

const removeExerciseInput = z.object({ blockMovementId: z.uuid() });

// Remove a pending exercise (block_movement) from a session. Server-side guard:
// the movement must have ZERO sets attached. UI hides the button once sets
// exist, but we re-check here so a stale client can't accidentally delete an
// exercise with logged data.
export const removeExerciseFromSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(removeExerciseInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();

    // Atomic: delete only when the movement is owned AND has zero sets. Checking
    // emptiness inside the DELETE closes the count-then-delete window where a
    // concurrently logged set would be cascade-deleted.
    const [row] = await db
      .delete(blockMovements)
      .where(
        and(
          eq(blockMovements.id, data.blockMovementId),
          eq(blockMovements.athleteId, athleteId),
          sql`NOT EXISTS (SELECT 1 FROM ${sets} WHERE ${sets.blockMovementId} = ${blockMovements.id})`,
        ),
      )
      .returning({ id: blockMovements.id, blockId: blockMovements.blockId });
    if (row) {
      // A step emptied of its last exercise is meaningless — drop the block
      // too (best-effort; a concurrent addExerciseToStep loses the race and
      // errors on the FK, which is the rarer flow).
      await db
        .delete(sessionBlocks)
        .where(
          and(
            eq(sessionBlocks.id, row.blockId),
            eq(sessionBlocks.athleteId, athleteId),
            sql`NOT EXISTS (SELECT 1 FROM ${blockMovements} WHERE ${blockMovements.blockId} = ${sessionBlocks.id})`,
          ),
        );
      return { id: row.id };
    }

    // Nothing deleted — distinguish "has sets" from "not found" for the message.
    const [{ setCount }] = await db
      .select({ setCount: sql<number>`COUNT(*)::int` })
      .from(sets)
      .where(and(eq(sets.blockMovementId, data.blockMovementId), eq(sets.athleteId, athleteId)));
    if (setCount > 0) throw new Error("Nie można usunąć ćwiczenia, w którym są już zapisane serie.");
    throw new Error("Ćwiczenie nie znalezione");
  });

const retireInput = z.object({ blockMovementId: z.uuid(), fromRound: z.int().min(1).max(99) });

// Soft-remove from a circuit: the exercise keeps its logged history and stops
// rendering from `fromRound` on. Guard: the step must keep ≥1 active exercise.
export const retireExerciseFromStep = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(retireInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [movement] = await db
      .select({ id: blockMovements.id, blockId: blockMovements.blockId })
      .from(blockMovements)
      .where(and(eq(blockMovements.id, data.blockMovementId), eq(blockMovements.athleteId, athleteId)));
    if (!movement) throw new Error("Nie znaleziono ćwiczenia w tej sesji.");

    const active = await db
      .select({ id: blockMovements.id })
      .from(blockMovements)
      .where(and(eq(blockMovements.blockId, movement.blockId), isNull(blockMovements.removedAfterRound)));
    if (active.length <= 1) throw new Error("Obwód musi mieć co najmniej jedno aktywne ćwiczenie.");

    await db
      .update(blockMovements)
      .set({ removedAfterRound: data.fromRound - 1 })
      .where(eq(blockMovements.id, movement.id));
    return { id: movement.id };
  });

const updateTargetInput = z
  .object({
    blockMovementId: z.uuid(),
    targetReps: z.int().min(1).max(100000).nullable(),
    targetDistanceM: z.int().min(1).max(100000).nullable(),
  })
  .refine((d) => d.targetReps === null || d.targetDistanceM === null, {
    message: "Stacja może mieć tylko jeden cel.",
  });

// Hyrox pre-start target edit. Every completed STATION segment mirrors a row
// into `sets` (see saveHyroxSegments), so "the block has any sets" is an
// exact proxy for "the block has started" — enforced atomically in the same
// UPDATE, mirroring removeExerciseFromSession's NOT EXISTS guard.
export const updateStationTarget = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(updateTargetInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [movement] = await db
      .select({ id: blockMovements.id, blockId: blockMovements.blockId })
      .from(blockMovements)
      .where(and(eq(blockMovements.id, data.blockMovementId), eq(blockMovements.athleteId, athleteId)));
    if (!movement) throw new Error("Nie znaleziono ćwiczenia w tej sesji.");

    const [row] = await db
      .update(blockMovements)
      .set({ targetReps: data.targetReps, targetDistanceM: data.targetDistanceM })
      .where(
        and(
          eq(blockMovements.id, data.blockMovementId),
          eq(blockMovements.athleteId, athleteId),
          sql`NOT EXISTS (
            SELECT 1 FROM ${sets}
            INNER JOIN block_movements bm ON ${sets.blockMovementId} = bm.id
            WHERE bm.block_id = ${movement.blockId}
          )`,
        ),
      )
      .returning({ id: blockMovements.id });
    if (!row) throw new Error("Nie można edytować bloku po wystartowaniu.");
    return { id: row.id };
  });

const swapInput = z.object({ blockMovementId: z.uuid(), newExerciseId: z.uuid(), fromRound: z.int().min(1).max(99) });

// Swap = retire (or hard-delete when set-less) + add the replacement at the
// same position, atomically from the athlete's perspective.
export const swapExerciseInStep = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(swapInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const { db: tx_db, end } = await createPool();
    try {
      return await tx_db.transaction(async (tx) => {
        const [movement] = await tx
          .select({
            id: blockMovements.id,
            blockId: blockMovements.blockId,
            orderIndex: blockMovements.orderIndex,
          })
          .from(blockMovements)
          .where(and(eq(blockMovements.id, data.blockMovementId), eq(blockMovements.athleteId, athleteId)));
        if (!movement) throw new Error("Nie znaleziono ćwiczenia w tej sesji.");

        const [duplicate] = await tx
          .select({ id: blockMovements.id })
          .from(blockMovements)
          .where(
            and(
              eq(blockMovements.blockId, movement.blockId),
              eq(blockMovements.exerciseId, data.newExerciseId),
              isNull(blockMovements.removedAfterRound),
            ),
          );
        if (duplicate) throw new Error("To ćwiczenie jest już w tym obwodzie.");

        const [{ setCount }] = await tx
          .select({ setCount: sql<number>`COUNT(*)::int` })
          .from(sets)
          .where(eq(sets.blockMovementId, movement.id));
        if (setCount === 0) {
          await tx.delete(blockMovements).where(eq(blockMovements.id, movement.id));
        } else {
          await tx
            .update(blockMovements)
            .set({ removedAfterRound: data.fromRound - 1 })
            .where(eq(blockMovements.id, movement.id));
        }

        const [row] = await tx
          .insert(blockMovements)
          .values({
            athleteId,
            blockId: movement.blockId,
            orderIndex: movement.orderIndex,
            exerciseId: data.newExerciseId,
          })
          .returning({ id: blockMovements.id });
        return { blockMovementId: row.id };
      });
    } finally {
      await end();
    }
  });
