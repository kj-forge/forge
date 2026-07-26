// Server-only query helpers shared by server fns (sessions, stats,
// dashboard). NEVER import this file from views/routes — it touches
// db/client at call time and must stay out of the client bundle
// (see the tree-shaking note in sessions.ts).
import { and, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "../../../../db/client";
import {
  blockMovements,
  exercises,
  sessionBlocks,
  sessionSegments,
  sessions,
  sets,
  trainingPlanUnitStepExercises,
} from "../../../../db/schema";
import { epleyE1RM } from "../lib/e1rm";
import { hasWorkingSets } from "../lib/format-sets-compact";
import { bestE1RM } from "../lib/pr";
import { sessionDurationMin } from "../lib/session-duration";

export type SessionTopExercise = { name: string; weightKg: number | null; reps: number | null; setCount: number };

const sessionCardColumns = {
  id: sessions.id,
  date: sessions.date,
  type: sessions.type,
  title: sessions.title,
  startedAt: sessions.startedAt,
  endedAt: sessions.endedAt,
};

// Attach each session's exercise previews (ordered, with the heaviest logged
// set per exercise) in one batched join. Left join keeps planned-but-empty
// exercises; the heaviest set is reduced in JS.
export async function attachExercises<T extends { id: string }>(athleteId: string, sessionRows: T[]) {
  if (sessionRows.length === 0) return [] as (T & { exercises: SessionTopExercise[] })[];

  const ids = sessionRows.map((s) => s.id);
  const rows = await db
    .select({
      sessionId: sessionBlocks.sessionId,
      movementId: blockMovements.id,
      name: exercises.namePl,
      weightKg: sets.weightKg,
      reps: sets.reps,
    })
    .from(blockMovements)
    .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
    .innerJoin(exercises, eq(blockMovements.exerciseId, exercises.id))
    .leftJoin(sets, eq(sets.blockMovementId, blockMovements.id))
    .where(and(eq(blockMovements.athleteId, athleteId), inArray(sessionBlocks.sessionId, ids)))
    // Block orderIndex must lead — after the steps split, movements carry
    // orderIndex 0 within their own block, so block order IS the exercise
    // order of the session.
    .orderBy(sessionBlocks.sessionId, sessionBlocks.orderIndex, blockMovements.orderIndex);

  type TopSet = SessionTopExercise & { hasSet: boolean };
  const bySession = new Map<string, Map<string, TopSet>>();
  for (const row of rows) {
    let movements = bySession.get(row.sessionId);
    if (!movements) {
      movements = new Map();
      bySession.set(row.sessionId, movements);
    }
    let top = movements.get(row.movementId);
    if (!top) {
      top = { name: row.name, weightKg: null, reps: null, setCount: 0, hasSet: false };
      movements.set(row.movementId, top);
    }
    const isRealSet = row.reps !== null || row.weightKg !== null;
    if (!isRealSet) continue;
    top.setCount += 1;
    const heavier =
      !top.hasSet ||
      (row.weightKg ?? -1) > (top.weightKg ?? -1) ||
      ((row.weightKg ?? -1) === (top.weightKg ?? -1) && (row.reps ?? -1) > (top.reps ?? -1));
    if (heavier) {
      top.weightKg = row.weightKg;
      top.reps = row.reps;
      top.hasSet = true;
    }
  }

  return sessionRows.map((s) => ({
    ...s,
    // Map preserves insertion order, and rows arrive ordered by orderIndex.
    exercises: [...(bySession.get(s.id)?.values() ?? [])].map((m) => ({
      name: m.name,
      weightKg: m.weightKg,
      reps: m.reps,
      setCount: m.setCount,
    })),
  }));
}

export type DurationInputs = { firstSetAt: Date | null; segmentsMs: number };

// min(sets.createdAt) and sum(segments.durationMs) per session, one query
// each — feeds sessionDurationMin (lib/session-duration.ts) for both list
// paths. sets has no direct sessionId, so it joins up through blockMovements
// → sessionBlocks; sessionSegments carries its own sessionId directly.
export async function attachDurationInputs(
  athleteId: string,
  sessionIds: string[],
): Promise<Map<string, DurationInputs>> {
  const map = new Map<string, DurationInputs>();
  if (sessionIds.length === 0) return map;
  for (const id of sessionIds) map.set(id, { firstSetAt: null, segmentsMs: 0 });

  const firstSets = await db
    .select({
      sessionId: sessionBlocks.sessionId,
      firstSetAt: sql<Date>`MIN(${sets.createdAt})`.mapWith((v) => new Date(v)),
    })
    .from(sets)
    .innerJoin(blockMovements, eq(sets.blockMovementId, blockMovements.id))
    .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
    .where(and(eq(sets.athleteId, athleteId), inArray(sessionBlocks.sessionId, sessionIds)))
    .groupBy(sessionBlocks.sessionId);
  for (const r of firstSets) {
    const entry = map.get(r.sessionId);
    if (entry) entry.firstSetAt = r.firstSetAt;
  }

  const segs = await db
    .select({
      sessionId: sessionSegments.sessionId,
      segmentsMs: sql<number>`COALESCE(SUM(${sessionSegments.durationMs}), 0)::int`,
    })
    .from(sessionSegments)
    .where(and(eq(sessionSegments.athleteId, athleteId), inArray(sessionSegments.sessionId, sessionIds)))
    .groupBy(sessionSegments.sessionId);
  for (const r of segs) {
    const entry = map.get(r.sessionId);
    if (entry) entry.segmentsMs = r.segmentsMs;
  }

  return map;
}

// Shared by both list paths: batches attachDurationInputs, then folds each
// session's inputs through sessionDurationMin.
export async function withDurationMin<
  T extends { id: string; type: string; startedAt: Date | null; endedAt: Date | null },
>(athleteId: string, sessionRows: T[]): Promise<(T & { durationMin: number | null })[]> {
  const durationInputs = await attachDurationInputs(
    athleteId,
    sessionRows.map((s) => s.id),
  );
  return sessionRows.map((s) => ({
    ...s,
    durationMin: sessionDurationMin({
      type: s.type,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      ...(durationInputs.get(s.id) ?? { firstSetAt: null, segmentsMs: 0 }),
    }),
  }));
}

// Dashboard feed: most recent sessions including the in-progress one.
export async function loadRecentSessions(athleteId: string, limit = 10) {
  const sessionRows = await db
    .select(sessionCardColumns)
    .from(sessions)
    .where(eq(sessions.athleteId, athleteId))
    .orderBy(desc(sessions.date), desc(sessions.startedAt))
    .limit(limit);
  const withExercises = await attachExercises(athleteId, sessionRows);
  return withDurationMin(athleteId, withExercises);
}

export type E1rmPoint = { date: string; e1rm: number };

// Everything the per-exercise stats view needs: record, e1RM points per
// ended session, and the recent session history with full set lists.
export async function loadExerciseStats(athleteId: string, slug: string) {
  // Full editor shape (ManagedExercise) — the stats page opens the same
  // editor drawer as the library.
  const [exercise] = await db
    .select({
      id: exercises.id,
      slug: exercises.slug,
      namePl: exercises.namePl,
      category: exercises.category,
      defaultUnit: exercises.defaultUnit,
      aliases: exercises.aliases,
      isMainLift: exercises.isMainLift,
      isPrTracked: exercises.isPrTracked,
      isLoadedBodyweight: exercises.isLoadedBodyweight,
      isArchived: exercises.isArchived,
    })
    .from(exercises)
    // Owned rows only — slugs are per-athlete namespaces since ADR-0020.
    .where(and(eq(exercises.athleteId, athleteId), eq(exercises.slug, slug)))
    .limit(1);
  if (!exercise) return null;

  const rows = await db
    .select({
      sessionId: sessions.id,
      date: sessions.date,
      weightKg: sets.weightKg,
      reps: sets.reps,
      kind: sets.kind,
    })
    .from(sets)
    .innerJoin(blockMovements, eq(sets.blockMovementId, blockMovements.id))
    .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
    .innerJoin(sessions, eq(sessionBlocks.sessionId, sessions.id))
    .where(and(eq(sets.athleteId, athleteId), eq(blockMovements.exerciseId, exercise.id), isNotNull(sessions.endedAt)))
    .orderBy(sessions.date, sessions.startedAt, sets.setNumber);

  const isLoadedBw = exercise.isLoadedBodyweight;

  // Group per session — rows arrive chronological, Map keeps that order.
  const bySession = new Map<
    string,
    { date: string; sets: { weightKg: number | null; reps: number | null; kind: string }[] }
  >();
  for (const row of rows) {
    let entry = bySession.get(row.sessionId);
    if (!entry) {
      entry = { date: row.date, sets: [] };
      bySession.set(row.sessionId, entry);
    }
    entry.sets.push({ weightKg: row.weightKg, reps: row.reps, kind: row.kind });
  }
  const sessionEntries = [...bySession.values()];

  const points: E1rmPoint[] = isLoadedBw
    ? []
    : sessionEntries.flatMap((s) => {
        const e1rm = bestE1RM(s.sets);
        return e1rm !== null ? [{ date: s.date, e1rm }] : [];
      });

  // Heaviest set with its FIRST-achieved date (same semantics as the PR table).
  let best: { weightKg: number; reps: number; date: string } | null = null;
  for (const row of rows) {
    if (row.kind === "WARMUP" || row.weightKg === null || row.reps === null) continue;
    const better = !best || row.weightKg > best.weightKg || (row.weightKg === best.weightKg && row.reps > best.reps);
    if (better) best = { weightKg: row.weightKg, reps: row.reps, date: row.date };
  }

  // Warmup-only appearances would render as an empty line in the history.
  const history = sessionEntries
    .filter((s) => hasWorkingSets(s.sets))
    .slice(-20)
    .reverse()
    .map((s) => ({ date: s.date, sets: s.sets, e1rm: isLoadedBw ? null : bestE1RM(s.sets) }));

  // inUse drives the editor's archive-vs-delete label; logged sets settle it,
  // otherwise a plan slot still blocks hard delete.
  const inUse =
    rows.length > 0 ||
    (
      await db
        .select({ id: trainingPlanUnitStepExercises.id })
        .from(trainingPlanUnitStepExercises)
        .where(
          and(
            eq(trainingPlanUnitStepExercises.athleteId, athleteId),
            eq(trainingPlanUnitStepExercises.exerciseId, exercise.id),
          ),
        )
        .limit(1)
    ).length > 0;

  return {
    exercise: { ...exercise, inUse },
    isLoadedBw,
    points,
    best: best ? { ...best, e1rm: isLoadedBw ? null : epleyE1RM(best.weightKg, best.reps) } : null,
    history,
  };
}

export type PrTableRow = {
  exerciseId: string;
  slug: string;
  namePl: string;
  isMainLift: boolean;
  isLoadedBodyweight: boolean;
  best: { weightKg: number; reps: number; e1rm: number | null; date: string } | null;
};

// All-time bests: the athlete's main lifts always (flag on their own rows,
// user-editable since ADR-0020); with includeAccessories every OTHER owned
// exercise that actually has logged history joins below them. Two batched
// queries regardless of exercise count. Ordered by namePl within each group.
export async function loadPrTable(athleteId: string, includeAccessories: boolean): Promise<PrTableRow[]> {
  // Main lifts are in unconditionally; accessories additionally need the
  // per-exercise isPrTracked opt-in (library toggle, default on).
  const scope = includeAccessories
    ? and(
        eq(exercises.athleteId, athleteId),
        eq(exercises.isArchived, false),
        or(eq(exercises.isMainLift, true), eq(exercises.isPrTracked, true)),
      )
    : and(eq(exercises.athleteId, athleteId), eq(exercises.isArchived, false), eq(exercises.isMainLift, true));
  const exerciseRows = await db
    .select({
      exerciseId: exercises.id,
      slug: exercises.slug,
      namePl: exercises.namePl,
      isMainLift: exercises.isMainLift,
      isLoadedBodyweight: exercises.isLoadedBodyweight,
    })
    .from(exercises)
    .where(scope);
  if (exerciseRows.length === 0) return [];

  // Ordered by date so a tie on weight+reps keeps the FIRST achievement —
  // that is the record's date, later repeats don't move it.
  const setRows = await db
    .select({
      exerciseId: blockMovements.exerciseId,
      weightKg: sets.weightKg,
      reps: sets.reps,
      date: sessions.date,
    })
    .from(sets)
    .innerJoin(blockMovements, eq(sets.blockMovementId, blockMovements.id))
    .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
    .innerJoin(sessions, eq(sessionBlocks.sessionId, sessions.id))
    .where(
      and(
        eq(sets.athleteId, athleteId),
        isNotNull(sessions.endedAt),
        inArray(
          blockMovements.exerciseId,
          exerciseRows.map((e) => e.exerciseId),
        ),
        ne(sets.kind, "WARMUP"),
        isNotNull(sets.weightKg),
        isNotNull(sets.reps),
      ),
    )
    .orderBy(sessions.date, sessions.startedAt);

  const bestByExercise = new Map<string, { weightKg: number; reps: number; date: string }>();
  for (const row of setRows) {
    if (row.weightKg === null || row.reps === null) continue;
    const cur = bestByExercise.get(row.exerciseId);
    const better = !cur || row.weightKg > cur.weightKg || (row.weightKg === cur.weightKg && row.reps > cur.reps);
    if (better) bestByExercise.set(row.exerciseId, { weightKg: row.weightKg, reps: row.reps, date: row.date });
  }

  return (
    exerciseRows
      .map((e) => {
        const best = bestByExercise.get(e.exerciseId) ?? null;
        return {
          ...e,
          best: best ? { ...best, e1rm: e.isLoadedBodyweight ? null : epleyE1RM(best.weightKg, best.reps) } : null,
        };
      })
      // Main lifts always show (even data-less); accessories only earn a row
      // once they have history — 30 "brak danych" lines help nobody.
      .filter((e) => e.isMainLift || e.best !== null)
      .sort((a, b) => Number(b.isMainLift) - Number(a.isMainLift) || a.namePl.localeCompare(b.namePl, "pl"))
  );
}
