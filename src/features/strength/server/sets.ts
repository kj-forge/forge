import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { db } from "../../../../db/client";
import { blockMovements, sessionBlocks, sessions, sets } from "../../../../db/schema";

const addSetInput = z.object({
  blockMovementId: z.uuid(),
  reps: z.int().min(0).max(1000).optional(),
  weightKg: z.number().min(0).max(1000).optional(),
  rpe: z.int().min(1).max(10).optional(),
  kind: z.enum(["WARMUP", "TOP_SET", "WORK", "BACK_OFF", "FAILURE", "DROP_SET"]).default("WORK"),
  notes: z.string().max(500).optional(),
});

export const addSet = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => addSetInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();

    // Verify the block_movement belongs to this athlete.
    const [movement] = await db
      .select({ id: blockMovements.id })
      .from(blockMovements)
      .where(and(eq(blockMovements.id, data.blockMovementId), eq(blockMovements.athleteId, athleteId)))
      .limit(1);
    if (!movement) throw new Error("Nie znaleziono ćwiczenia w tej sesji.");

    // Next setNumber for this movement.
    const [{ nextNum }] = await db
      .select({ nextNum: sql<number>`COALESCE(MAX(${sets.setNumber}), 0) + 1` })
      .from(sets)
      .where(eq(sets.blockMovementId, data.blockMovementId));

    const [row] = await db
      .insert(sets)
      .values({
        athleteId,
        blockMovementId: data.blockMovementId,
        setNumber: nextNum,
        reps: data.reps,
        weightKg: data.weightKg,
        rpe: data.rpe,
        kind: data.kind,
        notes: data.notes,
      })
      .returning();

    return row;
  });

const deleteSetInput = z.object({ setId: z.uuid() });

export const deleteSet = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteSetInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .delete(sets)
      .where(and(eq(sets.id, data.setId), eq(sets.athleteId, athleteId)))
      .returning({ id: sets.id });
    if (!row) throw new Error("Nie znaleziono serii.");
    return row;
  });

const progressionInput = z.object({ exerciseId: z.uuid() });

export const suggestProgression = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => progressionInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();

    // Two-step lookup: first find the SINGLE most recent completed session
    // that contains this exercise, then fetch only its sets. The previous
    // single-query implementation used `LIMIT 20 ORDER BY sets.createdAt`,
    // which silently spanned multiple sessions and mixed their RPE values
    // into the heuristic — see workflow review HIGH #1.
    const [lastSession] = await db
      .selectDistinct({ id: sessions.id })
      .from(sessions)
      .innerJoin(sessionBlocks, eq(sessionBlocks.sessionId, sessions.id))
      .innerJoin(blockMovements, eq(blockMovements.blockId, sessionBlocks.id))
      .where(
        and(
          eq(sessions.athleteId, athleteId),
          eq(blockMovements.exerciseId, data.exerciseId),
          sql`${sessions.endedAt} IS NOT NULL`,
        ),
      )
      .orderBy(desc(sessions.endedAt))
      .limit(1);

    if (!lastSession) {
      return { shouldProgress: false, reason: "Brak historii dla tego ćwiczenia." };
    }

    const recentSets = await db
      .select({
        reps: sets.reps,
        weightKg: sets.weightKg,
        rpe: sets.rpe,
        kind: sets.kind,
        setNumber: sets.setNumber,
      })
      .from(sets)
      .innerJoin(blockMovements, eq(sets.blockMovementId, blockMovements.id))
      .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
      .where(
        and(
          eq(sets.athleteId, athleteId),
          eq(blockMovements.exerciseId, data.exerciseId),
          eq(sessionBlocks.sessionId, lastSession.id),
        ),
      )
      .orderBy(desc(sets.setNumber));

    if (recentSets.length === 0) {
      return { shouldProgress: false, reason: "Brak serii w poprzedniej sesji." };
    }

    const workingSets = recentSets.filter((s) => s.kind !== "WARMUP");
    if (workingSets.length === 0) {
      return { shouldProgress: false, reason: "Brak serii roboczych w historii." };
    }

    const rpedSets = workingSets.filter((s) => s.rpe !== null);
    if (rpedSets.length === 0) {
      return {
        shouldProgress: false,
        reason: "Brak danych RPE — zaloguj RPE w następnych seriach, żeby dostać sugestię.",
      };
    }

    const maxRpe = Math.max(...rpedSets.map((s) => s.rpe ?? 0));
    if (maxRpe <= 8) {
      const lastWeight = rpedSets[0]?.weightKg ?? null;
      if (lastWeight !== null) {
        return {
          shouldProgress: true,
          suggestedDelta: { weightKg: 2.5 },
          reason: `RPE ≤ 8 we wszystkich seriach roboczych (max ${maxRpe}) — czas na +2.5 kg.`,
        };
      }
      return {
        shouldProgress: true,
        suggestedDelta: { reps: 1 },
        reason: `RPE ≤ 8 we wszystkich seriach roboczych (max ${maxRpe}) — czas na +1 powtórzenie.`,
      };
    }

    return {
      shouldProgress: false,
      reason: `Max RPE = ${maxRpe} — utrzymaj obecny ciężar, dopracuj formę.`,
    };
  });
