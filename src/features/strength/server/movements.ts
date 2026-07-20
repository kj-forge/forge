import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { parseInput } from "@/lib/validate";
import { db } from "../../../../db/client";
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
