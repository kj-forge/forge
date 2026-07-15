// Server-only query helpers shared by server fns (sessions, stats,
// dashboard). NEVER import this file from views/routes — it touches
// db/client at call time and must stay out of the client bundle
// (see the tree-shaking note in sessions.ts).
import { and, desc, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import { db } from "../../../../db/client";
import { blockMovements, exercises, sessionBlocks, sessions, sets } from "../../../../db/schema";
import { ACCESSORY_SLUGS, LOADED_BW_SLUGS, PR_TABLE_SLUG_ORDER } from "../constants";
import { epleyE1RM } from "../lib/e1rm";
import { bestE1RM } from "../lib/pr";

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
    .orderBy(sessionBlocks.sessionId, blockMovements.orderIndex);

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

// Dashboard feed: most recent sessions including the in-progress one.
export async function loadRecentSessions(athleteId: string, limit = 10) {
  const sessionRows = await db
    .select(sessionCardColumns)
    .from(sessions)
    .where(eq(sessions.athleteId, athleteId))
    .orderBy(desc(sessions.date), desc(sessions.startedAt))
    .limit(limit);
  return attachExercises(athleteId, sessionRows);
}

export type E1rmPoint = { date: string; e1rm: number };

// Everything the per-exercise stats view needs: record, e1RM points per
// ended session, and the recent session history with full set lists.
export async function loadExerciseStats(athleteId: string, slug: string) {
  const [exercise] = await db
    .select({ id: exercises.id, slug: exercises.slug, namePl: exercises.namePl })
    .from(exercises)
    .where(eq(exercises.slug, slug))
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

  const isLoadedBw = (LOADED_BW_SLUGS as readonly string[]).includes(slug);

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

  const history = sessionEntries
    .slice(-20)
    .reverse()
    .map((s) => ({ date: s.date, sets: s.sets, e1rm: isLoadedBw ? null : bestE1RM(s.sets) }));

  return {
    exercise,
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
  best: { weightKg: number; reps: number; e1rm: number | null; date: string } | null;
};

const slugOrder = (slug: string) => {
  const idx = PR_TABLE_SLUG_ORDER.indexOf(slug as (typeof PR_TABLE_SLUG_ORDER)[number]);
  return idx === -1 ? PR_TABLE_SLUG_ORDER.length : idx;
};

// All-time bests for the main lifts (and optionally the accessory group):
// heaviest qualifying set per exercise plus its Epley e1RM and the date it
// was FIRST achieved. Two batched queries regardless of exercise count.
export async function loadPrTable(athleteId: string, includeAccessories: boolean): Promise<PrTableRow[]> {
  const scope = includeAccessories
    ? or(eq(exercises.isMainLift, true), inArray(exercises.slug, [...ACCESSORY_SLUGS]))
    : eq(exercises.isMainLift, true);
  const exerciseRows = await db
    .select({
      exerciseId: exercises.id,
      slug: exercises.slug,
      namePl: exercises.namePl,
      isMainLift: exercises.isMainLift,
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

  return exerciseRows
    .sort((a, b) => slugOrder(a.slug) - slugOrder(b.slug))
    .map((e) => {
      const best = bestByExercise.get(e.exerciseId) ?? null;
      const isLoadedBw = (LOADED_BW_SLUGS as readonly string[]).includes(e.slug);
      return {
        ...e,
        best: best ? { ...best, e1rm: isLoadedBw ? null : epleyE1RM(best.weightKg, best.reps) } : null,
      };
    });
}
