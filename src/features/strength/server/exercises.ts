import { createServerFn } from "@tanstack/react-start";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { db } from "../../../../db/client";
import { blockMovements, exercises } from "../../../../db/schema";

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
