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

    // Defense in depth against double-add races: when the client invalidates
    // the route loader after a successful add, slow mobile networks can leave
    // the UI showing stale data long enough that the user taps "add" twice on
    // the same exercise. The client-side in-flight lock catches the common
    // case, but a stale re-render or a flaky network can still slip through.
    // Reject duplicates server-side with a friendly Polish message.
    const [existing] = await db
      .select({ id: blockMovements.id })
      .from(blockMovements)
      .where(and(eq(blockMovements.blockId, block.id), eq(blockMovements.exerciseId, data.exerciseId)))
      .limit(1);
    if (existing) throw new Error("To ćwiczenie jest już w tej sesji.");

    const [{ nextIndex }] = await db
      .select({ nextIndex: sql<number>`COALESCE(MAX(${blockMovements.orderIndex}), -1) + 1` })
      .from(blockMovements)
      .where(eq(blockMovements.blockId, block.id));

    const [row] = await db
      .insert(blockMovements)
      .values({
        athleteId,
        blockId: block.id,
        orderIndex: nextIndex,
        exerciseId: data.exerciseId,
      })
      .returning({ id: blockMovements.id });

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

    const [{ setCount }] = await db
      .select({ setCount: sql<number>`COUNT(*)::int` })
      .from(sets)
      .where(eq(sets.blockMovementId, data.blockMovementId));

    if (setCount > 0) {
      throw new Error("Nie można usunąć ćwiczenia, w którym są już zapisane serie.");
    }

    const [row] = await db
      .delete(blockMovements)
      .where(and(eq(blockMovements.id, data.blockMovementId), eq(blockMovements.athleteId, athleteId)))
      .returning({ id: blockMovements.id });
    if (!row) throw new Error("Ćwiczenie nie znalezione");
    return row;
  });
