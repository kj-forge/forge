import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, ilike, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { parseInput } from "@/lib/validate";
import { db } from "../../../../db/client";
import { blockMovements, exercises, trainingPlanUnitStepExercises } from "../../../../db/schema";
import { EXERCISE_CATEGORIES, EXERCISE_UNITS } from "../constants";
import { slugify } from "../lib/slugify";

const searchInput = z.object({ query: z.string().trim().min(1).max(50) });

export const searchExercises = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => parseInput(searchInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
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
        and(
          // Owned rows only (ADR-0020) — templates never surface in the app.
          eq(exercises.athleteId, athleteId),
          eq(exercises.isArchived, false),
          or(
            ilike(exercises.namePl, pattern),
            ilike(exercises.nameEn, pattern),
            // jsonb aliases array — match any element containing the query.
            sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${exercises.aliases}) AS alias WHERE alias ILIKE ${pattern})`,
          ),
        ),
      )
      .orderBy(exercises.namePl)
      .limit(20);
  });

// The athlete's full catalogue for pickers that want a plain list (goal
// drawer, plan editor) — search stays the tool for typed lookups.
export const listAllExercises = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  return db
    .select({
      id: exercises.id,
      namePl: exercises.namePl,
      aliases: exercises.aliases,
      defaultUnit: exercises.defaultUnit,
    })
    .from(exercises)
    .where(and(eq(exercises.athleteId, athleteId), eq(exercises.isArchived, false)))
    .orderBy(exercises.namePl);
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
    .where(and(eq(blockMovements.athleteId, athleteId), eq(exercises.isArchived, false)))
    .groupBy(exercises.id, exercises.slug, exercises.namePl, exercises.category)
    .orderBy(desc(sql`MAX(${blockMovements.createdAt})`))
    .limit(10);
});

// ============================================================================
// Catalogue management (ADR-0020) — the athlete edits their own copies.
// ============================================================================

// Full catalogue for the management screen, including archived rows and
// whether the exercise carries logged history (drives archive-vs-delete).
export const listManagedExercises = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  const rows = await db
    .select({
      id: exercises.id,
      slug: exercises.slug,
      namePl: exercises.namePl,
      category: exercises.category,
      defaultUnit: exercises.defaultUnit,
      isMainLift: exercises.isMainLift,
      isPrTracked: exercises.isPrTracked,
      isLoadedBodyweight: exercises.isLoadedBodyweight,
      isArchived: exercises.isArchived,
      aliases: exercises.aliases,
    })
    .from(exercises)
    .where(eq(exercises.athleteId, athleteId))
    .orderBy(exercises.namePl);

  const used = await db
    .select({ exerciseId: blockMovements.exerciseId, n: sql<number>`count(*)::int` })
    .from(blockMovements)
    .where(eq(blockMovements.athleteId, athleteId))
    .groupBy(blockMovements.exerciseId);
  const usedSet = new Set(used.map((u) => u.exerciseId));

  const planned = await db
    .select({ exerciseId: trainingPlanUnitStepExercises.exerciseId })
    .from(trainingPlanUnitStepExercises)
    .where(eq(trainingPlanUnitStepExercises.athleteId, athleteId));
  const plannedSet = new Set(planned.map((p) => p.exerciseId));

  return rows.map((r) => ({ ...r, inUse: usedSet.has(r.id) || plannedSet.has(r.id) }));
});

const exerciseFields = {
  namePl: z.string().trim().min(1, "Podaj nazwę.").max(80),
  category: z.enum(EXERCISE_CATEGORIES),
  defaultUnit: z.enum(EXERCISE_UNITS),
  isMainLift: z.boolean(),
  isPrTracked: z.boolean().default(true),
  isLoadedBodyweight: z.boolean(),
  aliases: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
};

const createExerciseInput = z.object(exerciseFields);

export const createExercise = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(createExerciseInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();

    // Slug from the name; suffix on collision within the athlete's namespace.
    const base = slugify(data.namePl);
    const taken = await db
      .select({ slug: exercises.slug })
      .from(exercises)
      .where(and(eq(exercises.athleteId, athleteId), like(exercises.slug, `${base}%`)));
    const takenSet = new Set(taken.map((t) => t.slug));
    let slug = base;
    for (let i = 2; takenSet.has(slug); i++) slug = `${base}-${i}`;

    const [row] = await db
      .insert(exercises)
      .values({
        athleteId,
        slug,
        namePl: data.namePl,
        // No separate English name in the app UI — mirror the Polish one so
        // search-by-nameEn stays harmless.
        nameEn: data.namePl,
        category: data.category,
        defaultUnit: data.defaultUnit,
        isMainLift: data.isMainLift,
        isPrTracked: data.isPrTracked,
        isLoadedBodyweight: data.isLoadedBodyweight,
        aliases: data.aliases,
      })
      .returning({ id: exercises.id, slug: exercises.slug });
    return row;
  });

const updateExerciseInput = z.object({ id: z.uuid(), ...exerciseFields });

// Slug intentionally stays stable on rename — /stats/$slug links keep working.
export const updateExercise = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(updateExerciseInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .update(exercises)
      .set({
        namePl: data.namePl,
        nameEn: data.namePl,
        category: data.category,
        defaultUnit: data.defaultUnit,
        isMainLift: data.isMainLift,
        isPrTracked: data.isPrTracked,
        isLoadedBodyweight: data.isLoadedBodyweight,
        aliases: data.aliases,
      })
      .where(and(eq(exercises.id, data.id), eq(exercises.athleteId, athleteId)))
      .returning({ id: exercises.id });
    if (!row) throw new Error("Nie znaleziono ćwiczenia.");
    return row;
  });

const deleteExerciseInput = z.object({ exerciseId: z.uuid() });

// With logged history (sessions or plan) the row is archived — hard delete
// would break the block_movements RESTRICT FK and erase stats. Unused rows
// delete for real.
export const deleteExercise = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(deleteExerciseInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();

    const [inSessions] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(blockMovements)
      .where(and(eq(blockMovements.athleteId, athleteId), eq(blockMovements.exerciseId, data.exerciseId)));
    const [inPlan] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(trainingPlanUnitStepExercises)
      .where(
        and(
          eq(trainingPlanUnitStepExercises.athleteId, athleteId),
          eq(trainingPlanUnitStepExercises.exerciseId, data.exerciseId),
        ),
      );

    if (inSessions.n > 0 || inPlan.n > 0) {
      const [row] = await db
        .update(exercises)
        .set({ isArchived: true })
        .where(and(eq(exercises.id, data.exerciseId), eq(exercises.athleteId, athleteId)))
        .returning({ id: exercises.id });
      if (!row) throw new Error("Nie znaleziono ćwiczenia.");
      return { archived: true };
    }

    const [row] = await db
      .delete(exercises)
      .where(and(eq(exercises.id, data.exerciseId), eq(exercises.athleteId, athleteId)))
      .returning({ id: exercises.id });
    if (!row) throw new Error("Nie znaleziono ćwiczenia.");
    return { archived: false };
  });

const restoreExerciseInput = z.object({ exerciseId: z.uuid() });

export const restoreExercise = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(restoreExerciseInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [row] = await db
      .update(exercises)
      .set({ isArchived: false })
      .where(and(eq(exercises.id, data.exerciseId), eq(exercises.athleteId, athleteId)))
      .returning({ id: exercises.id });
    if (!row) throw new Error("Nie znaleziono ćwiczenia.");
    return row;
  });
