import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getCurrentAthleteOrThrow } from "@/features/auth/server/current-athlete";
import { PICKABLE_SESSION_TYPES } from "@/features/strength/constants";
import { parseInput } from "@/lib/validate";
import { db } from "../../../../db/client";
import { createPool } from "../../../../db/pool";
import {
  scheduleOverrides,
  trainingPlans,
  trainingPlanUnitDays,
  trainingPlanUnitStepExercises,
  trainingPlanUnitSteps,
  trainingPlanUnits,
} from "../../../../db/schema";
import { UNIT_INTENSITIES } from "../constants";
import { warsawTodayIso, weekdayOfIso, weekStartIso } from "../lib/schedule";
import { unitTrainingRequired } from "../lib/unit-form";
import { loadPlans, loadStartableUnits, loadWeekSchedule } from "./queries";

// ---------------------------------------------------------------------------
// Reads

const getPlanScreenInput = z.object({ weekStart: z.iso.date().optional() }).optional();

export const getPlanScreen = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => parseInput(getPlanScreenInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    // Snap any date to its Monday so deep links can't skew the grid.
    const weekStart = weekStartIso(data?.weekStart ?? warsawTodayIso());
    const [schedule, plans] = await Promise.all([loadWeekSchedule(athleteId, weekStart), loadPlans(athleteId)]);
    return { schedule, plans };
  });

// Lean payload for the new-session screen: startable STRENGTH units only.
export const getStartableUnits = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  return loadStartableUnits(athleteId);
});

// ---------------------------------------------------------------------------
// Plan CRUD

const planFields = {
  name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120),
  description: z.string().trim().max(1000).optional(),
};

export const createPlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(z.object(planFields), data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    const [plan] = await db
      .insert(trainingPlans)
      .values({ athleteId, name: data.name, description: data.description || null })
      .returning({ id: trainingPlans.id });
    return plan;
  });

export const updatePlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(z.object({ planId: z.uuid(), ...planFields }), data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    await db
      .update(trainingPlans)
      .set({ name: data.name, description: data.description || null, updatedAt: new Date() })
      .where(and(eq(trainingPlans.id, data.planId), eq(trainingPlans.athleteId, athleteId)));
  });

// Cascades take units, their exercises, weekday assignments and overrides.
// Logged sessions never reference plans, so history is untouched.
export const deletePlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(z.object({ planId: z.uuid() }), data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    await db
      .delete(trainingPlans)
      .where(and(eq(trainingPlans.id, data.planId), eq(trainingPlans.athleteId, athleteId)));
  });

// ---------------------------------------------------------------------------
// Unit CRUD

const stepExerciseInput = z.object({
  exerciseId: z.uuid(),
  targetReps: z.number().int().min(1).max(1000).optional(),
  targetDistanceM: z.number().int().min(1).max(50000).optional(),
});

// A unit step: a workout step (1..n exercises, optional round target) or a
// REST break. Kind values are the blockKind subset units may hold.
const unitStepInput = z
  .object({
    kind: z.enum(["STRAIGHT_SETS", "REST"]),
    targetRounds: z.number().int().min(1).max(30).optional(),
    durationSeconds: z.number().int().min(5).max(3600).optional(),
    restSeconds: z.number().int().min(5).max(3600).optional(),
    note: z.string().trim().max(500).optional(),
    exercises: z.array(stepExerciseInput).max(12).default([]),
  })
  .refine((s) => (s.kind === "REST" ? s.exercises.length === 0 : s.exercises.length > 0), {
    message: "Krok treningowy musi mieć ćwiczenia, a przerwa nie może ich mieć.",
  });

const upsertUnitInput = z
  .object({
    planId: z.uuid(),
    unitId: z.uuid().optional(),
    name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120),
    sessionType: z.enum(PICKABLE_SESSION_TYPES),
    intensity: z.enum(UNIT_INTENSITIES),
    training: z.string().trim().max(2000),
    goal: z.string().trim().max(500).optional(),
    // Ordered steps; persisted for STRENGTH and HYROX units.
    steps: z.array(unitStepInput).max(20).default([]),
  })
  .refine(
    (v) =>
      !unitTrainingRequired(
        v.sessionType,
        v.sessionType === "STRENGTH" || v.sessionType === "HYROX"
          ? v.steps.reduce((n, s) => n + s.exercises.length, 0)
          : 0,
      ) || v.training.length > 0,
    { path: ["training"], message: "Trening jest wymagany, chyba że jednostka ma ćwiczenia siłowe." },
  );

type UnitStepInput = z.infer<typeof unitStepInput>;

interface RunUpsertUnitArgs {
  athleteId: string;
  planId: string;
  unitId: string | undefined;
  name: string;
  sessionType: (typeof PICKABLE_SESSION_TYPES)[number];
  intensity: (typeof UNIT_INTENSITIES)[number];
  training: string;
  goal: string | null;
  steps: UnitStepInput[];
}

// NOT exported — keeps the pool import out of the client bundle. Persisting
// the unit + its ordered exercise list needs a transaction (upsert parent,
// replace children); the HTTP driver can't hold multi-statement transactions.
async function runUpsertUnit(args: RunUpsertUnitArgs): Promise<{ id: string }> {
  const { db: tx_db, end } = await createPool();
  try {
    return await tx_db.transaction(async (tx) => {
      let unitId = args.unitId;
      if (unitId) {
        const [updated] = await tx
          .update(trainingPlanUnits)
          .set({
            name: args.name,
            sessionType: args.sessionType,
            intensity: args.intensity,
            training: args.training,
            goal: args.goal,
            updatedAt: new Date(),
          })
          .where(and(eq(trainingPlanUnits.id, unitId), eq(trainingPlanUnits.athleteId, args.athleteId)))
          .returning({ id: trainingPlanUnits.id });
        if (!updated) throw new Error("Nie znaleziono jednostki treningowej.");
      } else {
        const [plan] = await tx
          .select({ id: trainingPlans.id })
          .from(trainingPlans)
          .where(and(eq(trainingPlans.id, args.planId), eq(trainingPlans.athleteId, args.athleteId)));
        if (!plan) throw new Error("Nie znaleziono planu.");
        const [created] = await tx
          .insert(trainingPlanUnits)
          .values({
            athleteId: args.athleteId,
            planId: args.planId,
            orderIndex: sql`coalesce((select max(order_index) + 1 from training_plan_units where plan_id = ${args.planId}), 0)`,
            name: args.name,
            sessionType: args.sessionType,
            intensity: args.intensity,
            training: args.training,
            goal: args.goal,
          })
          .returning({ id: trainingPlanUnits.id });
        unitId = created.id;
      }

      // Replace the ordered steps wholesale — simpler and race-free vs
      // diffing (cascade takes the step exercises). Non-strength unit ends
      // up with none.
      await tx.delete(trainingPlanUnitSteps).where(eq(trainingPlanUnitSteps.unitId, unitId));
      for (const [orderIndex, step] of args.steps.entries()) {
        const [created] = await tx
          .insert(trainingPlanUnitSteps)
          .values({
            athleteId: args.athleteId,
            unitId,
            orderIndex,
            kind: step.kind,
            targetRounds: step.targetRounds ?? null,
            durationSeconds: step.durationSeconds ?? null,
            restSeconds: step.restSeconds ?? null,
            note: step.note || null,
          })
          .returning({ id: trainingPlanUnitSteps.id });
        if (step.exercises.length > 0) {
          await tx.insert(trainingPlanUnitStepExercises).values(
            step.exercises.map((ex, i) => ({
              athleteId: args.athleteId,
              stepId: created.id,
              orderIndex: i,
              exerciseId: ex.exerciseId,
              targetReps: ex.targetReps ?? null,
              targetDistanceM: ex.targetDistanceM ?? null,
            })),
          );
        }
      }
      return { id: unitId };
    });
  } finally {
    await end();
  }
}

export const upsertUnit = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(upsertUnitInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    return runUpsertUnit({
      athleteId,
      planId: data.planId,
      unitId: data.unitId,
      name: data.name,
      sessionType: data.sessionType,
      intensity: data.intensity,
      training: data.training,
      goal: data.goal ? data.goal : null,
      steps: data.sessionType === "STRENGTH" || data.sessionType === "HYROX" ? data.steps : [],
    });
  });

export const deleteUnit = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(z.object({ unitId: z.uuid() }), data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    await db
      .delete(trainingPlanUnits)
      .where(and(eq(trainingPlanUnits.id, data.unitId), eq(trainingPlanUnits.athleteId, athleteId)));
  });

// ---------------------------------------------------------------------------
// Activation lifecycle

const activatePlanInput = z
  .object({
    planId: z.uuid(),
    startDate: z.iso.date(),
    endDate: z.iso.date().optional(),
    assignments: z.array(z.object({ unitId: z.uuid(), days: z.array(z.number().int().min(0).max(6)).max(7) })).min(1),
  })
  .refine((v) => v.assignments.some((a) => a.days.length > 0), {
    path: ["assignments"],
    message: "Przypisz przynajmniej jedną jednostkę do dnia tygodnia.",
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "Data końca nie może być przed datą startu.",
  });

interface RunActivateArgs {
  athleteId: string;
  planId: string;
  startDate: string;
  endDate: string | null;
  assignments: { unitId: string; days: number[] }[];
}

// Serves first activation and re-activation alike: sets the window and
// replaces the plan's weekday assignments wholesale.
async function runActivatePlan(args: RunActivateArgs): Promise<void> {
  const { db: tx_db, end } = await createPool();
  try {
    await tx_db.transaction(async (tx) => {
      const planUnits = await tx
        .select({ id: trainingPlanUnits.id })
        .from(trainingPlanUnits)
        .innerJoin(trainingPlans, eq(trainingPlanUnits.planId, trainingPlans.id))
        .where(and(eq(trainingPlans.id, args.planId), eq(trainingPlans.athleteId, args.athleteId)));
      if (planUnits.length === 0) throw new Error("Plan nie ma jednostek treningowych.");
      const unitIds = new Set(planUnits.map((u) => u.id));
      if (args.assignments.some((a) => !unitIds.has(a.unitId))) {
        throw new Error("Jednostka nie należy do tego planu.");
      }

      await tx
        .update(trainingPlans)
        .set({ status: "ACTIVE", startDate: args.startDate, endDate: args.endDate, updatedAt: new Date() })
        .where(eq(trainingPlans.id, args.planId));

      await tx.delete(trainingPlanUnitDays).where(
        inArray(
          trainingPlanUnitDays.unitId,
          planUnits.map((u) => u.id),
        ),
      );
      // Per-date exceptions referenced the OLD pattern — left behind they turn
      // into orphaned SKIPs/ADDs that later corrupt drag collapsing. A new
      // activation starts with a clean slate (ADHOC rows have no unit, stay).
      await tx.delete(scheduleOverrides).where(
        inArray(
          scheduleOverrides.unitId,
          planUnits.map((u) => u.id),
        ),
      );
      const rows = args.assignments.flatMap((a) =>
        [...new Set(a.days)].map((dayOfWeek) => ({ athleteId: args.athleteId, unitId: a.unitId, dayOfWeek })),
      );
      if (rows.length > 0) await tx.insert(trainingPlanUnitDays).values(rows);
    });
  } finally {
    await end();
  }
}

export const activatePlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(activatePlanInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    await runActivatePlan({
      athleteId,
      planId: data.planId,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      assignments: data.assignments,
    });
  });

// Pausing keeps the weekday assignments — schedule reads filter on status —
// so re-activation can prefill the picker.
export const pausePlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(z.object({ planId: z.uuid() }), data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    await db
      .update(trainingPlans)
      .set({ status: "PAUSED", updatedAt: new Date() })
      .where(and(eq(trainingPlans.id, data.planId), eq(trainingPlans.athleteId, athleteId)));
  });

export const completePlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(z.object({ planId: z.uuid() }), data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    await db
      .update(trainingPlans)
      .set({ status: "COMPLETED", updatedAt: new Date() })
      .where(and(eq(trainingPlans.id, data.planId), eq(trainingPlans.athleteId, athleteId)));
  });

// ---------------------------------------------------------------------------
// Schedule overrides (per-date exceptions)

const isoDate = z.iso.date();

const moveScheduleEntryInput = z.discriminatedUnion("kind", [
  // A recurring plan entry dragged off its weekday: SKIP + ADD pair.
  z.object({ kind: z.literal("PLAN"), unitId: z.uuid(), fromDate: isoDate, toDate: isoDate }),
  // An existing ADD/ADHOC row dragged again: just re-date it (with pair
  // collapse when it lands back on its skipped origin).
  z.object({ kind: z.literal("OVERRIDE"), overrideId: z.uuid(), toDate: isoDate }),
]);

async function runMovePlanEntry(athleteId: string, unitId: string, fromDate: string, toDate: string): Promise<void> {
  const { db: tx_db, end } = await createPool();
  try {
    await tx_db.transaction(async (tx) => {
      const [unit] = await tx
        .select({ id: trainingPlanUnits.id })
        .from(trainingPlanUnits)
        .where(and(eq(trainingPlanUnits.id, unitId), eq(trainingPlanUnits.athleteId, athleteId)));
      if (!unit) throw new Error("Nie znaleziono jednostki treningowej.");
      await tx
        .insert(scheduleOverrides)
        .values({ athleteId, date: fromDate, kind: "SKIP", unitId })
        .onConflictDoNothing();
      await tx.insert(scheduleOverrides).values({ athleteId, date: toDate, kind: "ADD", unitId }).onConflictDoNothing();
    });
  } finally {
    await end();
  }
}

async function runMoveOverride(athleteId: string, overrideId: string, toDate: string): Promise<void> {
  const { db: tx_db, end } = await createPool();
  try {
    await tx_db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: scheduleOverrides.id,
          kind: scheduleOverrides.kind,
          unitId: scheduleOverrides.unitId,
        })
        .from(scheduleOverrides)
        .where(and(eq(scheduleOverrides.id, overrideId), eq(scheduleOverrides.athleteId, athleteId)));
      if (!row || row.kind === "SKIP") throw new Error("Nie znaleziono wpisu harmonogramu.");

      // Dragging an ADD back onto a date where its SKIP lives collapses the
      // pair instead of stacking exceptions — but ONLY when the base pattern
      // will actually re-render the unit there. A stale SKIP (left over from
      // a since-changed pattern) suppresses nothing, so collapsing against it
      // would delete the visible ADD and restore nothing.
      if (row.kind === "ADD" && row.unitId) {
        const [skip] = await tx
          .select({ id: scheduleOverrides.id })
          .from(scheduleOverrides)
          .where(
            and(
              eq(scheduleOverrides.athleteId, athleteId),
              eq(scheduleOverrides.unitId, row.unitId),
              eq(scheduleOverrides.date, toDate),
              eq(scheduleOverrides.kind, "SKIP"),
            ),
          );
        if (skip) {
          const [baseSlot] = await tx
            .select({ id: trainingPlanUnitDays.id })
            .from(trainingPlanUnitDays)
            .innerJoin(trainingPlanUnits, eq(trainingPlanUnitDays.unitId, trainingPlanUnits.id))
            .innerJoin(trainingPlans, eq(trainingPlanUnits.planId, trainingPlans.id))
            .where(
              and(
                eq(trainingPlanUnitDays.unitId, row.unitId),
                eq(trainingPlanUnitDays.dayOfWeek, weekdayOfIso(toDate)),
                eq(trainingPlans.status, "ACTIVE"),
                lte(trainingPlans.startDate, toDate),
                or(isNull(trainingPlans.endDate), gte(trainingPlans.endDate, toDate)),
              ),
            );
          if (baseSlot) {
            await tx.delete(scheduleOverrides).where(inArray(scheduleOverrides.id, [row.id, skip.id]));
            return;
          }
          // Stale SKIP: clean it up and just re-date the ADD.
          await tx.delete(scheduleOverrides).where(eq(scheduleOverrides.id, skip.id));
        }
      }
      await tx.update(scheduleOverrides).set({ date: toDate }).where(eq(scheduleOverrides.id, row.id));
    });
  } finally {
    await end();
  }
}

export const moveScheduleEntry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(moveScheduleEntryInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    if (data.kind === "PLAN") {
      if (data.fromDate === data.toDate) return;
      await runMovePlanEntry(athleteId, data.unitId, data.fromDate, data.toDate);
    } else {
      await runMoveOverride(athleteId, data.overrideId, data.toDate);
    }
  });

const addScheduleEntryInput = z.union([
  z.object({ date: isoDate, unitId: z.uuid() }),
  z.object({
    date: isoDate,
    sessionType: z.enum(PICKABLE_SESSION_TYPES),
    name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120),
    note: z.string().trim().max(500).optional(),
  }),
]);

export const addScheduleEntry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(addScheduleEntryInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    if ("unitId" in data) {
      const [unit] = await db
        .select({ id: trainingPlanUnits.id })
        .from(trainingPlanUnits)
        .where(and(eq(trainingPlanUnits.id, data.unitId), eq(trainingPlanUnits.athleteId, athleteId)));
      if (!unit) throw new Error("Nie znaleziono jednostki treningowej.");
      await db
        .insert(scheduleOverrides)
        .values({ athleteId, date: data.date, kind: "ADD", unitId: data.unitId })
        .onConflictDoNothing();
    } else {
      await db.insert(scheduleOverrides).values({
        athleteId,
        date: data.date,
        kind: "ADHOC",
        sessionType: data.sessionType,
        name: data.name,
        note: data.note || null,
      });
    }
  });

const removeScheduleEntryInput = z.union([
  // A recurring plan entry removed from one date → SKIP.
  z.object({ date: isoDate, unitId: z.uuid() }),
  // An ADD/ADHOC row → plain delete.
  z.object({ overrideId: z.uuid() }),
]);

export const removeScheduleEntry = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(removeScheduleEntryInput, data))
  .handler(async ({ data }) => {
    const { athleteId } = await getCurrentAthleteOrThrow();
    if ("overrideId" in data) {
      await db
        .delete(scheduleOverrides)
        .where(and(eq(scheduleOverrides.id, data.overrideId), eq(scheduleOverrides.athleteId, athleteId)));
    } else {
      const [unit] = await db
        .select({ id: trainingPlanUnits.id })
        .from(trainingPlanUnits)
        .where(and(eq(trainingPlanUnits.id, data.unitId), eq(trainingPlanUnits.athleteId, athleteId)));
      if (!unit) throw new Error("Nie znaleziono jednostki treningowej.");
      await db
        .insert(scheduleOverrides)
        .values({ athleteId, date: data.date, kind: "SKIP", unitId: data.unitId })
        .onConflictDoNothing();
    }
  });
