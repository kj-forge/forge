import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { db } from "../../../../db/client";
import { createPool } from "../../../../db/pool";
import { blockMovements, exercises, sessionBlocks, sessions, sets } from "../../../../db/schema";

export const listRecentSessions = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  return db
    .select({
      id: sessions.id,
      date: sessions.date,
      type: sessions.type,
      title: sessions.title,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .where(eq(sessions.athleteId, athleteId))
    .orderBy(desc(sessions.date))
    .limit(10);
});

const sessionDetailsInput = z.object({ sessionId: z.uuid() });

export const getSessionDetails = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => sessionDetailsInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();

    // Read-after-write race mitigation: a session just committed via the
    // WebSocket pool transaction can briefly be invisible to the HTTP driver
    // (different connection family on Neon's serverless side). Retry twice
    // with a short backoff before declaring "not found".
    let session: typeof sessions.$inferSelect | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      [session] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, data.sessionId), eq(sessions.athleteId, athleteId)))
        .limit(1);
      if (session) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 120));
    }
    if (!session) throw new Error("Nie znaleziono sesji.");

    const blocks = await db
      .select()
      .from(sessionBlocks)
      .where(eq(sessionBlocks.sessionId, session.id))
      .orderBy(sessionBlocks.orderIndex);

    const movements = blocks.length
      ? await db
          .select({
            id: blockMovements.id,
            blockId: blockMovements.blockId,
            orderIndex: blockMovements.orderIndex,
            exerciseId: blockMovements.exerciseId,
            // targetReps / targetWeightKg are cloned from the previous
            // session's last set when starting from a template. The drawer
            // uses them as defaults for the first set of each exercise.
            targetReps: blockMovements.targetReps,
            targetWeightKg: blockMovements.targetWeightKg,
            exerciseSlug: exercises.slug,
            exerciseNamePl: exercises.namePl,
            exerciseDefaultUnit: exercises.defaultUnit,
          })
          .from(blockMovements)
          .innerJoin(exercises, eq(blockMovements.exerciseId, exercises.id))
          .where(eq(blockMovements.blockId, blocks[0].id))
          .orderBy(blockMovements.orderIndex)
      : [];

    const movementIds = movements.map((m) => m.id);
    const setsRows = movementIds.length
      ? await db
          .select()
          .from(sets)
          .where(and(eq(sets.athleteId, athleteId), inArray(sets.blockMovementId, movementIds)))
          .orderBy(sets.blockMovementId, sets.setNumber)
      : [];

    const setsByMovement = new Map<string, typeof setsRows>();
    for (const set of setsRows) {
      const arr = setsByMovement.get(set.blockMovementId) ?? [];
      arr.push(set);
      setsByMovement.set(set.blockMovementId, arr);
    }

    return {
      session,
      block: blocks[0] ?? null,
      movements: movements.map((m) => ({
        ...m,
        sets: setsByMovement.get(m.id) ?? [],
      })),
    };
  });

const lastByDowInput = z.object({
  type: z.enum([
    "STRENGTH",
    "HYROX_EMOM",
    "HYROX_AMRAP",
    "HYROX_WORK",
    "CARDIO",
    "COMPROMISED_RUN",
    "REHAB",
    "MOBILITY",
  ]),
  dayOfWeek: z.int().min(0).max(6),
});

export const getLastSessionLikeByDow = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => lastByDowInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();

    // Try same day-of-week first; fall back to any session of the same type.
    const [byDow] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.athleteId, athleteId),
          eq(sessions.type, data.type),
          sql`EXTRACT(DOW FROM ${sessions.date}) = ${data.dayOfWeek}`,
        ),
      )
      .orderBy(desc(sessions.date))
      .limit(1);

    if (byDow) return byDow;

    const [byType] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.athleteId, athleteId), eq(sessions.type, data.type)))
      .orderBy(desc(sessions.date))
      .limit(1);
    return byType ?? null;
  });

const createSessionInput = z.object({
  type: z.enum([
    "STRENGTH",
    "HYROX_EMOM",
    "HYROX_AMRAP",
    "HYROX_WORK",
    "CARDIO",
    "COMPROMISED_RUN",
    "REHAB",
    "MOBILITY",
  ]),
  date: z.iso.date(),
  fromTemplateSessionId: z.uuid().optional(),
});

interface RunCreateSessionArgs {
  athleteId: string;
  type: z.infer<typeof createSessionInput>["type"];
  date: string;
  fromTemplateSessionId?: string;
}

interface CreateSessionResult {
  sessionId: string;
  blockId: string;
}

// NOT exported — keeping it module-internal ensures the bundler can strip the
// pool import from the client bundle. Exporting plain async functions that
// reference server-only modules forces the import to survive tree-shaking,
// which makes `db/pool.ts` execute in the browser and crash with
// `DATABASE_URL is not set`. When we add integration tests, we'll re-export
// behind a `serverOnly` wrapper or split into a server-only file.
//
// Atomic: session + 1 block (+ N movements if cloning template). All inserts
// ROLLBACK together if any step fails. A fresh WebSocket pool is acquired
// per call — Workers terminates idle sockets between requests, so module-
// scope reuse is unsafe — and disposed in the finally block.
async function runCreateSession(args: RunCreateSessionArgs): Promise<CreateSessionResult> {
  const { db: tx_db, end } = await createPool();
  try {
    return await tx_db.transaction(async (tx) => {
      // 1. Clone movements from template (if requested) — copy the EXERCISE
      // and the ACTUAL last set's reps/weight from the previous session into
      // the new movement's target_* columns (not the previous movement's
      // target_* which is almost always null in MVP). This is what gives the
      // exercise drawer its "defaults from last set" UX on the first save.
      const templateMovements = args.fromTemplateSessionId
        ? await tx
            .select({
              exerciseId: blockMovements.exerciseId,
              orderIndex: blockMovements.orderIndex,
              // Correlated subqueries: read the previous movement's LAST set
              // (by setNumber DESC). Returns null if the movement had no sets.
              lastReps: sql<number | null>`(
              SELECT s.reps FROM sets s
              WHERE s.block_movement_id = ${blockMovements.id}
              ORDER BY s.set_number DESC LIMIT 1
            )`,
              lastWeightKg: sql<number | null>`(
              SELECT s.weight_kg FROM sets s
              WHERE s.block_movement_id = ${blockMovements.id}
              ORDER BY s.set_number DESC LIMIT 1
            )`,
            })
            .from(blockMovements)
            .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
            .where(
              and(
                eq(sessionBlocks.sessionId, args.fromTemplateSessionId),
                eq(blockMovements.athleteId, args.athleteId),
              ),
            )
            .orderBy(blockMovements.orderIndex)
        : [];

      // 2. INSERT the session row.
      const [session] = await tx
        .insert(sessions)
        .values({
          athleteId: args.athleteId,
          date: args.date,
          type: args.type,
          startedAt: new Date(),
          source: "MANUAL",
        })
        .returning({ id: sessions.id });

      // 3. INSERT one block (strength is always a single STRAIGHT_SETS block in
      // MVP — Hyrox / interval layouts will reuse this fn with a different kind).
      const [block] = await tx
        .insert(sessionBlocks)
        .values({
          athleteId: args.athleteId,
          sessionId: session.id,
          orderIndex: 0,
          kind: "STRAIGHT_SETS",
        })
        .returning({ id: sessionBlocks.id });

      // 4. Optionally INSERT the cloned movements. target_* are populated from
      // the previous session's last set so the drawer can show meaningful
      // defaults for the very first set of each exercise.
      if (templateMovements.length > 0) {
        await tx.insert(blockMovements).values(
          templateMovements.map((m) => ({
            athleteId: args.athleteId,
            blockId: block.id,
            orderIndex: m.orderIndex,
            exerciseId: m.exerciseId,
            targetReps: m.lastReps,
            targetWeightKg: m.lastWeightKg,
          })),
        );
      }

      return { sessionId: session.id, blockId: block.id };
    });
  } finally {
    await end();
  }
}

export const createSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createSessionInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    return runCreateSession({ athleteId, ...data });
  });

const endSessionInput = z.object({
  sessionId: z.uuid(),
  notes: z.string().max(5000).optional(),
});

export const endSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => endSessionInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .update(sessions)
      .set({
        endedAt: new Date(),
        notes: data.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(sessions.id, data.sessionId), eq(sessions.athleteId, athleteId), isNull(sessions.endedAt)))
      .returning({ id: sessions.id, endedAt: sessions.endedAt });
    if (!row) throw new Error("Nie znaleziono sesji lub jest już zakończona.");
    return row;
  });

const updateNotesInput = z.object({
  sessionId: z.uuid(),
  notes: z.string().max(5000),
});

// Notes can be edited any time, including after the session is ended (unlike
// `endSession` which is one-shot and refuses if already ended).
export const updateSessionNotes = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateNotesInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .update(sessions)
      .set({ notes: data.notes, updatedAt: new Date() })
      .where(and(eq(sessions.id, data.sessionId), eq(sessions.athleteId, athleteId)))
      .returning({ id: sessions.id });
    if (!row) throw new Error("Nie znaleziono sesji.");
    return row;
  });

const deleteSessionInput = z.object({ sessionId: z.uuid() });

// Hard delete — FK cascades wipe session_blocks → block_movements → sets.
export const deleteSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteSessionInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .delete(sessions)
      .where(and(eq(sessions.id, data.sessionId), eq(sessions.athleteId, athleteId)))
      .returning({ id: sessions.id });
    if (!row) throw new Error("Nie znaleziono sesji.");
    return row;
  });
