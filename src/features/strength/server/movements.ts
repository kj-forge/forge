import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { db } from "../../../../db/client";
import { blockMovements, sessionBlocks, sessions, sets } from "../../../../db/schema";

const addExerciseInput = z.object({
  sessionId: z.uuid(),
  exerciseId: z.uuid(),
});

export const addExerciseToSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => addExerciseInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();

    // Find the session's block + next orderIndex. Strength MVP keeps a single
    // block per session, so block lookup is always one row.
    const [block] = await db
      .select({ id: sessionBlocks.id })
      .from(sessionBlocks)
      .innerJoin(sessions, eq(sessionBlocks.sessionId, sessions.id))
      .where(and(eq(sessionBlocks.sessionId, data.sessionId), eq(sessions.athleteId, athleteId)))
      .limit(1);
    if (!block) throw new Error("Nie znaleziono sesji.");

    const [{ nextIndex }] = await db
      .select({ nextIndex: sql<number>`COALESCE(MAX(${blockMovements.orderIndex}), -1) + 1` })
      .from(blockMovements)
      .where(eq(blockMovements.blockId, block.id));

    // The (block_id, exercise_id) unique index is the source of truth against
    // double-add races (slow network / double-tap). ON CONFLICT DO NOTHING
    // makes the duplicate a no-op; an empty `returning` means it was already
    // there.
    const [row] = await db
      .insert(blockMovements)
      .values({
        athleteId,
        blockId: block.id,
        orderIndex: nextIndex,
        exerciseId: data.exerciseId,
      })
      .onConflictDoNothing({ target: [blockMovements.blockId, blockMovements.exerciseId] })
      .returning({ id: blockMovements.id });
    if (!row) throw new Error("To ćwiczenie jest już w tej sesji.");

    return { blockMovementId: row.id, orderIndex: nextIndex };
  });

const removeExerciseInput = z.object({ blockMovementId: z.uuid() });

// Remove a pending exercise (block_movement) from a session. Server-side guard:
// the movement must have ZERO sets attached. UI hides the button once sets
// exist, but we re-check here so a stale client can't accidentally delete an
// exercise with logged data.
export const removeExerciseFromSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => removeExerciseInput.parse(data))
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
      .returning({ id: blockMovements.id });
    if (row) return row;

    // Nothing deleted — distinguish "has sets" from "not found" for the message.
    const [{ setCount }] = await db
      .select({ setCount: sql<number>`COUNT(*)::int` })
      .from(sets)
      .where(and(eq(sets.blockMovementId, data.blockMovementId), eq(sets.athleteId, athleteId)));
    if (setCount > 0) throw new Error("Nie można usunąć ćwiczenia, w którym są już zapisane serie.");
    throw new Error("Ćwiczenie nie znalezione");
  });
