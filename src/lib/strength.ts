// ============================================================================
// Strength training — server functions + atomic mutations
// ============================================================================
// Single file for everything strength-related on the server side. Pure async
// functions (testable in isolation) plus their `createServerFn` wrappers
// (callable from client components). Auth is enforced inside each server fn
// via `getCurrentAthleteOrThrow` — no client can call these unauthenticated.
//
// Atomic operations (multi-row dependent inserts) go through `dbPool`
// transactions. Single-statement reads/writes go through the HTTP `db` client.
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client";
import { dbPool } from "../../db/pool";
import { athletes, blockMovements, exercises, sessionBlocks, sessions, sets } from "../../db/schema";

import { auth } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Auth helper — resolves the current athlete or throws 401.
// Every strength server fn calls this first.
// ─────────────────────────────────────────────────────────────────────────────

interface CurrentAthlete {
  athleteId: string;
  userId: string;
}

async function getCurrentAthleteOrThrow(): Promise<CurrentAthlete> {
  const headers = new Headers(getRequestHeaders() as HeadersInit);
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw new Error("Unauthorized — no active session");
  }

  const [athlete] = await db
    .select({ id: athletes.id })
    .from(athletes)
    .where(eq(athletes.userId, session.user.id))
    .limit(1);

  if (!athlete) {
    // Should be impossible after a successful signup hook + ensureAthlete
    // recovery, but surface explicitly rather than silently failing later.
    throw new Error("No athlete row for this user — signup hook may have failed");
  }

  return { athleteId: athlete.id, userId: session.user.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// READ — list / get / search server fns
// ─────────────────────────────────────────────────────────────────────────────

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
    if (!session) throw new Error("Session not found");

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

const searchInput = z.object({ query: z.string().trim().min(1).max(50) });

export const searchExercises = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => searchInput.parse(data))
  .handler(async ({ data }) => {
    await getCurrentAthleteOrThrow();
    const pattern = `%${data.query}%`;
    return db
      .select({
        id: exercises.id,
        slug: exercises.slug,
        namePl: exercises.namePl,
        nameEn: exercises.nameEn,
        category: exercises.category,
        defaultUnit: exercises.defaultUnit,
      })
      .from(exercises)
      .where(
        or(
          ilike(exercises.namePl, pattern),
          ilike(exercises.nameEn, pattern),
          // jsonb aliases array — match any element containing the query.
          sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${exercises.aliases}) AS alias WHERE alias ILIKE ${pattern})`,
        ),
      )
      .orderBy(exercises.namePl)
      .limit(20);
  });

export const getRecentExercises = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  return db
    .select({
      id: exercises.id,
      slug: exercises.slug,
      namePl: exercises.namePl,
      category: exercises.category,
      lastUsed: sql<Date>`MAX(${blockMovements.createdAt})`.as("last_used"),
    })
    .from(blockMovements)
    .innerJoin(exercises, eq(blockMovements.exerciseId, exercises.id))
    .where(eq(blockMovements.athleteId, athleteId))
    .groupBy(exercises.id, exercises.slug, exercises.namePl, exercises.category)
    .orderBy(desc(sql`MAX(${blockMovements.createdAt})`))
    .limit(10);
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

// ─────────────────────────────────────────────────────────────────────────────
// WRITE — atomic createSession (transaction) + single-statement mutations
// ─────────────────────────────────────────────────────────────────────────────

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
// `dbPool` import from the client bundle. Exporting plain async functions that
// reference server-only modules (like dbPool) forces the import to survive
// tree-shaking, which makes `db/pool.ts` execute in the browser and crash with
// `DATABASE_URL is not set`. When we add integration tests, we'll re-export
// behind a `serverOnly` wrapper or split into a server-only file.
//
// Atomic: session + 1 block (+ N movements if cloning template). All inserts
// ROLLBACK together if any step fails.
async function runCreateSession(args: RunCreateSessionArgs): Promise<CreateSessionResult> {
  return dbPool.transaction(async (tx) => {
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
            and(eq(sessionBlocks.sessionId, args.fromTemplateSessionId), eq(blockMovements.athleteId, args.athleteId)),
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
}

export const createSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createSessionInput.parse(data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    return runCreateSession({ athleteId, ...data });
  });

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
    if (!block) throw new Error("Session not found or not owned by this athlete");

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
    if (!movement) throw new Error("Block movement not found or not owned by this athlete");

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
    if (!row) throw new Error("Session not found, not owned, or already ended");
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
    if (!row) throw new Error("Session not found");
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
    if (!row) throw new Error("Set not found");
    return row;
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
    if (!row) throw new Error("Session not found");
    return row;
  });
