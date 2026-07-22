import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { loadUnitSteps } from "@/features/plan/server/queries";
import { SESSION_TYPES } from "@/features/strength/constants";
import { parseInput } from "@/lib/validate";
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

const HISTORY_PAGE_SIZE = 30;

const listSessionsInput = z.object({
  offset: z.number().int().min(0).default(0),
  typ: z.enum(SESSION_TYPES).optional(),
});

// History feed, paged: ended sessions only (the dashboard is where an
// in-progress session lives), type filter applied server-side so paging
// respects it. Offset paging + client-side dedupe by id is right-sized here;
// keyset cursors become worth it when imports multiply the data (sort key is
// nullable-ridden).
export const listCompletedSessions = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => parseInput(listSessionsInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const scope = and(
      eq(sessions.athleteId, athleteId),
      isNotNull(sessions.endedAt),
      ...(data.typ ? [eq(sessions.type, data.typ)] : []),
    );
    // One extra row answers "is there a next page" without a COUNT query.
    const rows = await db
      .select({
        id: sessions.id,
        date: sessions.date,
        type: sessions.type,
        title: sessions.title,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
      })
      .from(sessions)
      .where(scope)
      .orderBy(desc(sessions.date), desc(sessions.startedAt))
      .limit(HISTORY_PAGE_SIZE + 1)
      .offset(data.offset);
    const page = rows.slice(0, HISTORY_PAGE_SIZE);

    // Chips need every type the athlete EVER logged — deriving them from the
    // loaded pages would hide types living deeper in the feed.
    const types =
      data.offset === 0
        ? (
            await db
              .selectDistinct({ type: sessions.type })
              .from(sessions)
              .where(and(eq(sessions.athleteId, athleteId), isNotNull(sessions.endedAt)))
          ).map((r) => r.type)
        : undefined;

    return {
      sessions: await attachExercises(athleteId, page),
      nextOffset: rows.length > HISTORY_PAGE_SIZE ? data.offset + HISTORY_PAGE_SIZE : null,
      types,
    };
  });

// Reference set per kind, surfaced as the drawer's smart defaults. Keyed by the
// three visible kinds — the only ones the picker can pre-fill.
export type RefKind = "WARMUP" | "TOP_SET" | "BACK_OFF";
export type KindRef = { reps: number | null; weightKg: number | null };
export type LastByKind = Partial<Record<RefKind, KindRef>>;
// The same session the refs were distilled from, kept whole — the drawer's
// "Ostatnio" line shows it so mid-workout nobody digs through history.
export type LastSessionSummary = {
  date: string;
  sets: { weightKg: number | null; reps: number | null; kind: string }[];
};

// For each exercise, find its most recent ENDED session of the SAME type and
// distil one reference set per kind. WARMUP = first (ramp up from the lightest),
// TOP_SET = heaviest (a descending ramp must not seed its lighter closing set),
// BACK_OFF = first. Two batched queries regardless of exercise count.
async function loadLastByKind(
  athleteId: string,
  type: (typeof sessions.$inferSelect)["type"],
  currentSessionId: string,
  exerciseIds: string[],
): Promise<Map<string, { refs: LastByKind; last: LastSessionSummary }>> {
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

  const result = new Map<string, { refs: LastByKind; last: LastSessionSummary }>();
  for (const [exerciseId, rows] of rowsByExercise) {
    const warmup = rows.find((r) => r.kind === "WARMUP");
    // TOP_SET = heaviest tagged top set (tie → the later one); fall back to
    // legacy WORK sets so exercises logged before the kind picker shipped
    // still seed a working default instead of opening blank.
    let topCandidates = rows.filter((r) => r.kind === "TOP_SET");
    if (topCandidates.length === 0) topCandidates = rows.filter((r) => r.kind === "WORK");
    let topSet: (typeof rows)[number] | undefined;
    for (const r of topCandidates) {
      if (!topSet || (r.weightKg ?? -1) >= (topSet.weightKg ?? -1)) topSet = r;
    }
    const backOff = rows.find((r) => r.kind === "BACK_OFF");
    const lbk: LastByKind = {};
    if (warmup) lbk.WARMUP = { reps: warmup.reps, weightKg: warmup.weightKg };
    if (topSet) lbk.TOP_SET = { reps: topSet.reps, weightKg: topSet.weightKg };
    if (backOff) lbk.BACK_OFF = { reps: backOff.reps, weightKg: backOff.weightKg };
    result.set(exerciseId, {
      refs: lbk,
      last: {
        date: best.get(exerciseId)?.date ?? "",
        sets: rows.map((r) => ({ weightKg: r.weightKg, reps: r.reps, kind: r.kind })),
      },
    });
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

    // Steps = ALL blocks in order. A 1-movement block renders the classic
    // exercise view, 2+ the round view, kind=REST an informational page.
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
            exerciseIsLoadedBodyweight: exercises.isLoadedBodyweight,
          })
          .from(blockMovements)
          .innerJoin(exercises, eq(blockMovements.exerciseId, exercises.id))
          .where(
            inArray(
              blockMovements.blockId,
              blocks.map((b) => b.id),
            ),
          )
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
      ? new Map<string, { refs: LastByKind; last: LastSessionSummary }>()
      : await loadLastByKind(
          athleteId,
          session.type,
          session.id,
          movements.map((m) => m.exerciseId),
        );

    const enrich = (m: (typeof movements)[number]) => {
      const lastEntry = lastByKindMap.get(m.exerciseId);
      return {
        ...m,
        sets: setsByMovement.get(m.id) ?? [],
        lastByKind: lastEntry?.refs ?? ({} as LastByKind),
        lastSession: lastEntry?.last ?? null,
      };
    };

    return {
      session,
      steps: blocks.map((block) => ({
        ...block,
        movements: movements.filter((m) => m.blockId === block.id).map(enrich),
      })),
    };
  });

const createSessionInput = z.object({
  type: z.enum([
    "STRENGTH",
    "HYROX",
    "RUNNING",
    "OTHER",
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
  // Seed the session from a plan unit (exercises resolved server-side). Any
  // owned unit works on any date — a missed Tuesday can run on Wednesday
  // without touching the plan itself.
  fromUnitId: z.uuid().optional(),
});

// One step to materialize into a session_block (+ its ordered exercises).
export interface SeedStep {
  kind: "STRAIGHT_SETS" | "REST";
  targetRounds: number | null;
  durationSeconds: number | null;
  // Hyrox blocks: declared rest between rounds.
  restSeconds: number | null;
  // REST steps carry their instruction in the block notes.
  note: string | null;
  exercises: { exerciseId: string; targetReps: number | null; targetDistanceM: number | null }[];
}

interface RunCreateSessionArgs {
  athleteId: string;
  type: z.infer<typeof createSessionInput>["type"];
  date: string;
  fromTemplateSessionId?: string;
  // Ordered steps to seed the session with (from the plan unit).
  seedSteps?: SeedStep[];
}

interface CreateSessionResult {
  sessionId: string;
}

// NOT exported — keeping it module-internal ensures the bundler can strip the
// pool import from the client bundle. Exporting plain async functions that
// reference server-only modules forces the import to survive tree-shaking,
// which makes `db/pool.ts` execute in the browser and crash with
// `DATABASE_URL is not set`. When we add integration tests, we'll re-export
// behind a `serverOnly` wrapper or split into a server-only file.
//
// Atomic: session + step blocks (+ movements). All inserts ROLLBACK together
// if any step fails. A fresh WebSocket pool is acquired per call — Workers
// terminates idle sockets between requests, so module-scope reuse is unsafe —
// and disposed in the finally block.
async function runCreateSession(args: RunCreateSessionArgs): Promise<CreateSessionResult> {
  const { db: tx_db, end } = await createPool();
  try {
    return await tx_db.transaction(async (tx) => {
      // 1. Seed the STEP STRUCTURE — either cloned from a template session
      // (repeat: block rows + their movements) or materialized from the plan
      // unit's steps (seedSteps, resolved by the caller). Exercises + order
      // only; per-set defaults are NOT copied — the drawer derives them at
      // load time from history (loadLastByKind), decoupling "what to train"
      // from "how much". WORK-block notes are outcome commentary and are NOT
      // cloned; REST notes are structural instructions and ARE.
      let seedSteps: SeedStep[];
      if (args.fromTemplateSessionId) {
        const blocks = await tx
          .select()
          .from(sessionBlocks)
          .where(
            and(eq(sessionBlocks.sessionId, args.fromTemplateSessionId), eq(sessionBlocks.athleteId, args.athleteId)),
          )
          .orderBy(sessionBlocks.orderIndex);
        const movementRows = blocks.length
          ? await tx
              .select({
                blockId: blockMovements.blockId,
                exerciseId: blockMovements.exerciseId,
                orderIndex: blockMovements.orderIndex,
                targetReps: blockMovements.targetReps,
                targetDistanceM: blockMovements.targetDistanceM,
              })
              .from(blockMovements)
              .where(
                inArray(
                  blockMovements.blockId,
                  blocks.map((b) => b.id),
                ),
              )
              .orderBy(blockMovements.orderIndex)
          : [];
        seedSteps = blocks
          .map((b) => ({
            kind: b.kind === "REST" ? ("REST" as const) : ("STRAIGHT_SETS" as const),
            targetRounds: b.targetRounds,
            durationSeconds: b.durationSeconds,
            restSeconds: b.restSeconds,
            note: b.kind === "REST" ? b.notes : null,
            exercises: movementRows
              .filter((m) => m.blockId === b.id)
              .map((m) => ({ exerciseId: m.exerciseId, targetReps: m.targetReps, targetDistanceM: m.targetDistanceM })),
          }))
          // A template's empty WORK blocks carry no information — skip them.
          .filter((s) => s.kind === "REST" || s.exercises.length > 0);
      } else {
        seedSteps = args.seedSteps ?? [];
      }

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

      // 3. INSERT the step blocks. A blank session gets none — the athlete
      // builds steps ad hoc ("+ Ćwiczenie" / "+ Superseria").
      for (const [orderIndex, step] of seedSteps.entries()) {
        const [block] = await tx
          .insert(sessionBlocks)
          .values({
            athleteId: args.athleteId,
            sessionId: session.id,
            orderIndex,
            kind: step.kind,
            targetRounds: step.targetRounds,
            durationSeconds: step.durationSeconds,
            restSeconds: step.restSeconds,
            notes: step.note,
          })
          .returning({ id: sessionBlocks.id });
        if (step.exercises.length > 0) {
          await tx.insert(blockMovements).values(
            step.exercises.map((ex, i) => ({
              athleteId: args.athleteId,
              blockId: block.id,
              orderIndex: i,
              exerciseId: ex.exerciseId,
              targetReps: ex.targetReps,
              targetDistanceM: ex.targetDistanceM,
            })),
          );
        }
      }

      return { sessionId: session.id };
    });
  } finally {
    await end();
  }
}

export const createSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(createSessionInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    // Resolve the unit's steps server-side rather than trusting client input.
    const seedSteps = data.fromUnitId ? await loadUnitSteps(athleteId, data.fromUnitId) : undefined;
    return runCreateSession({ athleteId, ...data, seedSteps });
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
