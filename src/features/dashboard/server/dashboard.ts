import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { loadActiveGoals } from "@/features/goals/server/queries";
import { loadTrainingPlan } from "@/features/plan/server/queries";
import { epleyE1RM } from "@/features/strength/lib/e1rm";
import { loadPrTable, loadRecentSessions } from "@/features/strength/server/queries";
import { db } from "../../../../db/client";
import { blockMovements, exercises, sessionBlocks, sessions, sets } from "../../../../db/schema";

export type TrendPoint = { date: string; e1rm: number };
export type Trend = { slug: string; namePl: string; points: TrendPoint[] };

// Sparkline data: per-session best e1RM for the athlete's most-trained main
// lift with at least two sessions of history (ties broken by name).
async function loadTrend(athleteId: string): Promise<Trend | null> {
  const rows = await db
    .select({
      slug: exercises.slug,
      namePl: exercises.namePl,
      sessionId: sessions.id,
      date: sessions.date,
      weightKg: sets.weightKg,
      reps: sets.reps,
    })
    .from(sets)
    .innerJoin(blockMovements, eq(sets.blockMovementId, blockMovements.id))
    .innerJoin(exercises, eq(blockMovements.exerciseId, exercises.id))
    .innerJoin(sessionBlocks, eq(blockMovements.blockId, sessionBlocks.id))
    .innerJoin(sessions, eq(sessionBlocks.sessionId, sessions.id))
    .where(
      and(
        eq(sets.athleteId, athleteId),
        // Owned rows only (ADR-0020) — the flag is per-athlete now.
        eq(exercises.athleteId, athleteId),
        eq(exercises.isMainLift, true),
        isNotNull(sessions.endedAt),
        ne(sets.kind, "WARMUP"),
        isNotNull(sets.weightKg),
        isNotNull(sets.reps),
      ),
    )
    .orderBy(sessions.date, sessions.startedAt);

  const bySlug = new Map<string, { namePl: string; bySession: Map<string, TrendPoint> }>();
  for (const row of rows) {
    if (row.weightKg === null || row.reps === null || row.reps < 1) continue;
    const e1rm = epleyE1RM(row.weightKg, row.reps);
    let entry = bySlug.get(row.slug);
    if (!entry) {
      entry = { namePl: row.namePl, bySession: new Map() };
      bySlug.set(row.slug, entry);
    }
    const point = entry.bySession.get(row.sessionId);
    if (!point || e1rm > point.e1rm) entry.bySession.set(row.sessionId, { date: row.date, e1rm });
  }

  // Pick the most-trained qualifying lift (was: canonical slug order, retired
  // with the per-user catalogue — slugs are user-editable data now).
  let bestSlug: string | null = null;
  let bestEntry: { namePl: string; bySession: Map<string, TrendPoint> } | null = null;
  for (const [slug, entry] of bySlug) {
    if (entry.bySession.size < 2) continue;
    const better =
      !bestEntry ||
      entry.bySession.size > bestEntry.bySession.size ||
      (entry.bySession.size === bestEntry.bySession.size && entry.namePl.localeCompare(bestEntry.namePl, "pl") < 0);
    if (better) {
      bestSlug = slug;
      bestEntry = entry;
    }
  }
  if (!bestSlug || !bestEntry) return null;
  // Rows arrive date-ordered, so insertion order IS chronological.
  return { slug: bestSlug, namePl: bestEntry.namePl, points: [...bestEntry.bySession.values()].slice(-10) };
}

// The athlete's most-trained weekdays (ended sessions, last 2 months) —
// feeds the generic Zestawienia shortcut chips.
async function loadWeekdayCounts(athleteId: string) {
  const floor = new Date();
  floor.setMonth(floor.getMonth() - 2);
  return db
    .select({
      weekday: sql<number>`(extract(isodow from ${sessions.date}))::int - 1`,
      count: sql<number>`count(*)::int`,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.athleteId, athleteId),
        isNotNull(sessions.endedAt),
        gte(sessions.date, floor.toISOString().slice(0, 10)),
      ),
    )
    .groupBy(sql`extract(isodow from ${sessions.date})`)
    .orderBy(sql`count(*) desc`)
    .limit(3);
}

// Everything Home needs in ONE round-trip — on Workers each server fn call
// from the client is a separate request, so the dashboard bundles them.
export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  const [recentSessions, plan, prs, trend, activeGoals, weekdayCounts] = await Promise.all([
    loadRecentSessions(athleteId, 10),
    loadTrainingPlan(athleteId),
    loadPrTable(athleteId, false),
    loadTrend(athleteId),
    loadActiveGoals(athleteId),
    loadWeekdayCounts(athleteId),
  ]);
  return { sessions: recentSessions, plan, prs, trend, goals: activeGoals, weekdayCounts };
});

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
