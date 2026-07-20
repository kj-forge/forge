import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { parseInput } from "@/lib/validate";
import { db } from "../../../../db/client";
import { createPool } from "../../../../db/pool";
import { blockMovements, sessionBlocks, sessions, sets } from "../../../../db/schema";
import { bestSet, isNewPR } from "../lib/pr";
import type { SetPr } from "./sets";

// ---------------------------------------------------------------------------
// Step (block) management. A step = one session_block; its shape drives the
// UI: 1 movement → classic exercise view, 2+ → round view, kind=REST → info
// page. There is no SUPERSET kind — shape is derived, so morph/split are pure
// movement moves that can never desync from a flag.

const addStepInput = z.object({
  sessionId: z.uuid(),
  // 1 id = "+ Ćwiczenie", 2+ = "+ Superseria" (order = round order).
  exerciseIds: z.array(z.uuid()).min(1).max(8),
});

interface RunAddStepArgs {
  athleteId: string;
  sessionId: string;
  exerciseIds: string[];
}

// NOT exported — keeps the pool import out of the client bundle (same
// reasoning as runCreateSession). Block + movements must land atomically.
async function runAddStep(args: RunAddStepArgs): Promise<{ blockId: string }> {
  const { db: tx_db, end } = await createPool();
  try {
    return await tx_db.transaction(async (tx) => {
      const [session] = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, args.sessionId), eq(sessions.athleteId, args.athleteId)));
      if (!session) throw new Error("Nie znaleziono sesji.");

      const [block] = await tx
        .insert(sessionBlocks)
        .values({
          athleteId: args.athleteId,
          sessionId: args.sessionId,
          orderIndex: sql`coalesce((select max(order_index) + 1 from session_blocks where session_id = ${args.sessionId}), 0)`,
          kind: "STRAIGHT_SETS",
        })
        .returning({ id: sessionBlocks.id });

      await tx.insert(blockMovements).values(
        args.exerciseIds.map((exerciseId, orderIndex) => ({
          athleteId: args.athleteId,
          blockId: block.id,
          orderIndex,
          exerciseId,
        })),
      );
      return { blockId: block.id };
    });
  } finally {
    await end();
  }
}

export const addStep = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(addStepInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    // Dedupe defensively — the (blockId, exerciseId) unique index would abort
    // the whole insert otherwise.
    const exerciseIds = [...new Set(data.exerciseIds)];
    return runAddStep({ athleteId, sessionId: data.sessionId, exerciseIds });
  });

// Remove a whole step. Guard: no logged sets anywhere in the block (the UI
// hides the action once sets exist; re-checked here against stale clients).
export const removeStep = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(z.object({ blockId: z.uuid() }), data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .delete(sessionBlocks)
      .where(
        and(
          eq(sessionBlocks.id, data.blockId),
          eq(sessionBlocks.athleteId, athleteId),
          sql`NOT EXISTS (
            SELECT 1 FROM ${sets}
            JOIN ${blockMovements} ON ${sets.blockMovementId} = ${blockMovements.id}
            WHERE ${blockMovements.blockId} = ${sessionBlocks.id}
          )`,
        ),
      )
      .returning({ id: sessionBlocks.id });
    if (!row) throw new Error("Nie można usunąć kroku, w którym są już zapisane serie.");
    return row;
  });

// Morph: attach one more exercise to an existing step (classic → superset).
export const addExerciseToStep = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(z.object({ blockId: z.uuid(), exerciseId: z.uuid() }), data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [block] = await db
      .select({ id: sessionBlocks.id })
      .from(sessionBlocks)
      .where(and(eq(sessionBlocks.id, data.blockId), eq(sessionBlocks.athleteId, athleteId)));
    if (!block) throw new Error("Nie znaleziono kroku.");

    const [row] = await db
      .insert(blockMovements)
      .values({
        athleteId,
        blockId: data.blockId,
        orderIndex: sql`coalesce((select max(order_index) + 1 from block_movements where block_id = ${data.blockId}), 0)`,
        exerciseId: data.exerciseId,
      })
      .onConflictDoNothing({ target: [blockMovements.blockId, blockMovements.exerciseId] })
      .returning({ id: blockMovements.id });
    if (!row) throw new Error("To ćwiczenie jest już w tym kroku.");
    return { blockMovementId: row.id };
  });

export const updateStepNotes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    parseInput(z.object({ blockId: z.uuid(), notes: z.string().trim().max(1000) }), data),
  )
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    await db
      .update(sessionBlocks)
      .set({ notes: data.notes || null })
      .where(and(eq(sessionBlocks.id, data.blockId), eq(sessionBlocks.athleteId, athleteId)));
  });

// ---------------------------------------------------------------------------
// Round logging

const roundEntryInput = z
  .object({
    blockMovementId: z.uuid(),
    reps: z.int().min(0).max(1000).optional(),
    weightKg: z.number().min(0).max(1000).optional(),
    durationSeconds: z.int().min(1).max(36000).optional(),
    rpe: z.int().min(1).max(10).optional(),
  })
  .refine((e) => e.reps !== undefined || e.weightKg !== undefined || e.durationSeconds !== undefined, {
    message: "Pusta seria.",
  });

const saveRoundInput = z.object({
  blockId: z.uuid(),
  roundNumber: z.int().min(1).max(99),
  // One kind per round — a warm-up round stamps every exercise in it.
  kind: z.enum(["WARMUP", "WORK", "TOP_SET", "BACK_OFF"]).default("WORK"),
  entries: z.array(roundEntryInput).min(1).max(12),
});

export type RoundEntryResult = { blockMovementId: string; setId: string | null; pr: SetPr | null };

interface RunSaveRoundArgs {
  athleteId: string;
  blockId: string;
  roundNumber: number;
  kind: "WARMUP" | "WORK" | "TOP_SET" | "BACK_OFF";
  entries: z.infer<typeof roundEntryInput>[];
}

// One atomic write per round: rows land together, one network round-trip on
// Workers. Idempotent vs double-tap — an entry whose movement already has a
// set at this roundNumber is skipped (setId null in the result).
async function runSaveRound(args: RunSaveRoundArgs): Promise<RoundEntryResult[]> {
  const { db: tx_db, end } = await createPool();
  try {
    return await tx_db.transaction(async (tx) => {
      const movements = await tx
        .select({ id: blockMovements.id, exerciseId: blockMovements.exerciseId })
        .from(blockMovements)
        .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
        .where(and(eq(sessionBlocks.id, args.blockId), eq(sessionBlocks.athleteId, args.athleteId)));
      if (movements.length === 0) throw new Error("Nie znaleziono kroku.");
      const byMovementId = new Map(movements.map((m) => [m.id, m]));
      if (args.entries.some((e) => !byMovementId.has(e.blockMovementId))) {
        throw new Error("Ćwiczenie nie należy do tego kroku.");
      }

      const existing = await tx
        .select({ blockMovementId: sets.blockMovementId })
        .from(sets)
        .where(
          and(
            inArray(
              sets.blockMovementId,
              args.entries.map((e) => e.blockMovementId),
            ),
            eq(sets.setNumber, args.roundNumber),
          ),
        );
      const alreadyLogged = new Set(existing.map((s) => s.blockMovementId));

      const results: RoundEntryResult[] = [];
      for (const entry of args.entries) {
        if (alreadyLogged.has(entry.blockMovementId)) {
          results.push({ blockMovementId: entry.blockMovementId, setId: null, pr: null });
          continue;
        }

        // Same PR semantics as addSet: a REAL weighted set with reps, never a
        // warm-up, checked against every prior set of that exercise (this
        // session included).
        const movement = byMovementId.get(entry.blockMovementId);
        let pr: SetPr | null = null;
        if (
          args.kind !== "WARMUP" &&
          movement &&
          entry.weightKg !== undefined &&
          entry.reps !== undefined &&
          entry.reps >= 1
        ) {
          const priorSets = await tx
            .select({ weightKg: sets.weightKg, reps: sets.reps, kind: sets.kind })
            .from(sets)
            .innerJoin(blockMovements, eq(sets.blockMovementId, blockMovements.id))
            .where(and(eq(sets.athleteId, args.athleteId), eq(blockMovements.exerciseId, movement.exerciseId)));
          const previousBest = bestSet(priorSets);
          if (previousBest !== null) {
            pr = { isNewPR: isNewPR({ weightKg: entry.weightKg, reps: entry.reps }, previousBest), previousBest };
          }
        }

        const [row] = await tx
          .insert(sets)
          .values({
            athleteId: args.athleteId,
            blockMovementId: entry.blockMovementId,
            setNumber: args.roundNumber,
            reps: entry.reps,
            weightKg: entry.weightKg,
            durationSeconds: entry.durationSeconds,
            rpe: entry.rpe,
            kind: args.kind,
          })
          .returning({ id: sets.id });
        results.push({ blockMovementId: entry.blockMovementId, setId: row.id, pr });
      }
      return results;
    });
  } finally {
    await end();
  }
}

export const saveRound = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(saveRoundInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    return runSaveRound({
      athleteId,
      blockId: data.blockId,
      roundNumber: data.roundNumber,
      kind: data.kind,
      entries: data.entries,
    });
  });

// Drop one whole round of a step (all movements' sets at that setNumber).
export const deleteRound = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    parseInput(z.object({ blockId: z.uuid(), roundNumber: z.int().min(1).max(99) }), data),
  )
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    await db.delete(sets).where(
      and(
        eq(sets.athleteId, athleteId),
        eq(sets.setNumber, data.roundNumber),
        sql`${sets.blockMovementId} IN (
          SELECT ${blockMovements.id} FROM ${blockMovements}
          JOIN ${sessionBlocks} ON ${blockMovements.blockId} = ${sessionBlocks.id}
          WHERE ${sessionBlocks.id} = ${data.blockId} AND ${sessionBlocks.athleteId} = ${athleteId}
        )`,
      ),
    );
  });
