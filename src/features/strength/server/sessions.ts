import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { loadPlanDayExerciseIds } from "@/features/plan/server/queries";
import { parseInput } from "@/lib/validate";
import { warsawWeekday } from "@/shared/lib/weekday";
import { db } from "../../../../db/client";
import { createPool } from "../../../../db/pool";
import { blockMovements, exercises, sessionBlocks, sessions, sets } from "../../../../db/schema";
import { attachExercises, loadRecentSessions } from "./queries";

// Dashboard feed: most recent sessions including the in-progress one (the badge
// marks it). The view sorts active to the top and trims the count.
export const listRecentSessions = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  return loadRecentSessions(athleteId, 10);
});

// History: only ENDED sessions — an in-progress one isn't "history" yet and is
// resumed from the dashboard. (Pagination is a later epic; capped for now.)
export const listCompletedSessions = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  const sessionRows = await db
    .select({
      id: sessions.id,
      date: sessions.date,
      type: sessions.type,
      title: sessions.title,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.athleteId, athleteId), isNotNull(sessions.endedAt)))
    .orderBy(desc(sessions.date), desc(sessions.startedAt))
    .limit(20);
  return attachExercises(athleteId, sessionRows);
});

// Reference set per kind, surfaced as the drawer's smart defaults. Keyed by the
// three visible kinds — the only ones the picker can pre-fill.
export type RefKind = "WARMUP" | "TOP_SET" | "BACK_OFF";
export type KindRef = { reps: number | null; weightKg: number | null };
export type LastByKind = Partial<Record<RefKind, KindRef>>;

// For each exercise, find its most recent ENDED session of the SAME type and
// distil one reference set per kind. WARMUP = first (ramp up from the lightest),
// TOP_SET = last (3 sets at one weight → the last is the working number),
// BACK_OFF = first. Two batched queries regardless of exercise count.
async function loadLastByKind(
  athleteId: string,
  type: (typeof sessions.$inferSelect)["type"],
  currentSessionId: string,
  exerciseIds: string[],
): Promise<Map<string, LastByKind>> {
  if (exerciseIds.length === 0) return new Map();

  // Q1: every prior movement of these exercises in an ended same-type session.
  const candidates = await db
    .select({
      exerciseId: blockMovements.exerciseId,
      movementId: blockMovements.id,
      date: sessions.date,
      startedAt: sessions.startedAt,
    })
    .from(blockMovements)
    .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
    .innerJoin(sessions, eq(sessionBlocks.sessionId, sessions.id))
    .where(
      and(
        eq(blockMovements.athleteId, athleteId),
        eq(sessions.type, type),
        ne(sessions.id, currentSessionId),
        isNotNull(sessions.endedAt),
        inArray(blockMovements.exerciseId, exerciseIds),
      ),
    );

  // Pick the most recent movement per exercise (date desc, then startedAt desc).
  const best = new Map<string, { movementId: string; date: string; startedAt: Date | null }>();
  for (const c of candidates) {
    const cur = best.get(c.exerciseId);
    const newer =
      !cur ||
      c.date > cur.date ||
      (c.date === cur.date && (c.startedAt?.getTime() ?? 0) > (cur.startedAt?.getTime() ?? 0));
    if (newer) best.set(c.exerciseId, { movementId: c.movementId, date: c.date, startedAt: c.startedAt });
  }
  if (best.size === 0) return new Map();

  const movementToExercise = new Map<string, string>();
  for (const [exerciseId, v] of best) movementToExercise.set(v.movementId, exerciseId);

  // Q2: all sets of the chosen movements, ordered so first/last per kind is direct.
  const setRows = await db
    .select({
      blockMovementId: sets.blockMovementId,
      kind: sets.kind,
      reps: sets.reps,
      weightKg: sets.weightKg,
    })
    .from(sets)
    .where(and(eq(sets.athleteId, athleteId), inArray(sets.blockMovementId, [...movementToExercise.keys()])))
    .orderBy(sets.blockMovementId, sets.setNumber);

  const rowsByExercise = new Map<string, typeof setRows>();
  for (const row of setRows) {
    const exerciseId = movementToExercise.get(row.blockMovementId);
    if (!exerciseId) continue;
    const arr = rowsByExercise.get(exerciseId) ?? [];
    arr.push(row);
    rowsByExercise.set(exerciseId, arr);
  }

  const result = new Map<string, LastByKind>();
  for (const [exerciseId, rows] of rowsByExercise) {
    const warmup = rows.find((r) => r.kind === "WARMUP");
    // TOP_SET = last tagged top set; fall back to the last legacy WORK set so
    // exercises logged before the kind picker shipped still seed a working
    // default instead of opening blank.
    let topCandidates = rows.filter((r) => r.kind === "TOP_SET");
    if (topCandidates.length === 0) topCandidates = rows.filter((r) => r.kind === "WORK");
    const topSet = topCandidates[topCandidates.length - 1];
    const backOff = rows.find((r) => r.kind === "BACK_OFF");
    const lbk: LastByKind = {};
    if (warmup) lbk.WARMUP = { reps: warmup.reps, weightKg: warmup.weightKg };
    if (topSet) lbk.TOP_SET = { reps: topSet.reps, weightKg: topSet.weightKg };
    if (backOff) lbk.BACK_OFF = { reps: backOff.reps, weightKg: backOff.weightKg };
    result.set(exerciseId, lbk);
  }
  return result;
}

const sessionDetailsInput = z.object({ sessionId: z.uuid() });

export const getSessionDetails = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => parseInput(sessionDetailsInput, data))
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

    // Smart defaults only matter while logging — an ended session is read-only.
    const lastByKindMap = session.endedAt
      ? new Map<string, LastByKind>()
      : await loadLastByKind(
          athleteId,
          session.type,
          session.id,
          movements.map((m) => m.exerciseId),
        );

    return {
      session,
      block: blocks[0] ?? null,
      movements: movements.map((m) => ({
        ...m,
        sets: setsByMovement.get(m.id) ?? [],
        lastByKind: lastByKindMap.get(m.exerciseId) ?? ({} as LastByKind),
      })),
    };
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
  // Seed the session from today's plan day (resolved server-side by weekday).
  fromPlanDay: z.boolean().optional(),
});

interface RunCreateSessionArgs {
  athleteId: string;
  type: z.infer<typeof createSessionInput>["type"];
  date: string;
  fromTemplateSessionId?: string;
  // Ordered exercise ids to seed the block with (from the plan day).
  seedExerciseIds?: string[];
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
      // 1. Seed the EXERCISE LIST — either cloned from a template session
      // (repeat) or from the day's plan (seedExerciseIds, resolved by the
      // caller). Just exercises + order; per-set defaults are NOT copied — the
      // drawer derives them at load time from the athlete's per-kind history
      // (loadLastByKind), decoupling "what to train" from "how much".
      const seedMovements = args.fromTemplateSessionId
        ? await tx
            .select({
              exerciseId: blockMovements.exerciseId,
              orderIndex: blockMovements.orderIndex,
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
        : (args.seedExerciseIds ?? []).map((exerciseId, orderIndex) => ({ exerciseId, orderIndex }));

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

      // 4. Optionally INSERT the seeded movements (exercise + order only).
      if (seedMovements.length > 0) {
        await tx.insert(blockMovements).values(
          seedMovements.map((m) => ({
            athleteId: args.athleteId,
            blockId: block.id,
            orderIndex: m.orderIndex,
            exerciseId: m.exerciseId,
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
  .inputValidator((data: unknown) => parseInput(createSessionInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    // Resolve the plan day's exercises server-side (by weekday) rather than
    // trusting client-passed ids.
    const seedExerciseIds = data.fromPlanDay ? await loadPlanDayExerciseIds(athleteId, warsawWeekday()) : undefined;
    return runCreateSession({ athleteId, ...data, seedExerciseIds });
  });

const endSessionInput = z.object({
  sessionId: z.uuid(),
  notes: z.string().max(5000).optional(),
});

export const endSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(endSessionInput, data))
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
  .inputValidator((data: unknown) => parseInput(updateNotesInput, data))
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
  .inputValidator((data: unknown) => parseInput(deleteSessionInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .delete(sessions)
      .where(and(eq(sessions.id, data.sessionId), eq(sessions.athleteId, athleteId)))
      .returning({ id: sessions.id });
    if (!row) throw new Error("Nie znaleziono sesji.");
    return row;
  });
