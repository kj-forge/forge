// Server-only query helpers (shared with the dashboard fn). Never import
// from views/routes — must stay out of the client bundle.
import { and, asc, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "../../../../db/client";
import {
  exercises,
  scheduleOverrides,
  sessions,
  trainingPlans,
  trainingPlanUnitDays,
  trainingPlanUnitStepExercises,
  trainingPlanUnitSteps,
  trainingPlanUnits,
} from "../../../../db/schema";
import {
  resolveWeek,
  type ScheduleExercise,
  type ScheduleUnit,
  type WeekAssignment,
  type WeekOverride,
  warsawTodayIso,
  weekDates,
  weekStartIso,
} from "../lib/schedule";

// Ordered step rows (+ joined exercises) of the given units, in one pass.
// Steps drive both the flattened schedule display and session materialization.
async function loadStepsByUnit(athleteId: string, unitIds: string[]) {
  const byUnit = new Map<
    string,
    {
      id: string;
      kind: "STRAIGHT_SETS" | "REST";
      targetRounds: number | null;
      durationSeconds: number | null;
      note: string | null;
      exercises: ScheduleExercise[];
    }[]
  >();
  if (unitIds.length === 0) return byUnit;

  const stepRows = await db
    .select({
      id: trainingPlanUnitSteps.id,
      unitId: trainingPlanUnitSteps.unitId,
      kind: trainingPlanUnitSteps.kind,
      targetRounds: trainingPlanUnitSteps.targetRounds,
      durationSeconds: trainingPlanUnitSteps.durationSeconds,
      note: trainingPlanUnitSteps.note,
    })
    .from(trainingPlanUnitSteps)
    .where(and(eq(trainingPlanUnitSteps.athleteId, athleteId), inArray(trainingPlanUnitSteps.unitId, unitIds)))
    .orderBy(asc(trainingPlanUnitSteps.unitId), asc(trainingPlanUnitSteps.orderIndex));
  if (stepRows.length === 0) return byUnit;

  const exRows = await db
    .select({
      stepId: trainingPlanUnitStepExercises.stepId,
      exerciseId: trainingPlanUnitStepExercises.exerciseId,
      namePl: exercises.namePl,
    })
    .from(trainingPlanUnitStepExercises)
    .innerJoin(exercises, eq(trainingPlanUnitStepExercises.exerciseId, exercises.id))
    .where(
      inArray(
        trainingPlanUnitStepExercises.stepId,
        stepRows.map((s) => s.id),
      ),
    )
    .orderBy(asc(trainingPlanUnitStepExercises.stepId), asc(trainingPlanUnitStepExercises.orderIndex));
  const exByStep = new Map<string, ScheduleExercise[]>();
  for (const row of exRows) {
    const arr = exByStep.get(row.stepId) ?? [];
    arr.push({ exerciseId: row.exerciseId, namePl: row.namePl });
    exByStep.set(row.stepId, arr);
  }

  for (const step of stepRows) {
    const arr = byUnit.get(step.unitId) ?? [];
    arr.push({
      id: step.id,
      kind: step.kind === "REST" ? "REST" : "STRAIGHT_SETS",
      targetRounds: step.targetRounds,
      durationSeconds: step.durationSeconds,
      note: step.note,
      exercises: exByStep.get(step.id) ?? [],
    });
    byUnit.set(step.unitId, arr);
  }
  return byUnit;
}

// Flattened exercise list per unit — the schedule/dashboard display shape
// (unchanged consumers); order = step order, then order within the step.
async function loadExercisesByUnit(athleteId: string, unitIds: string[]) {
  const byUnit = new Map<string, ScheduleExercise[]>();
  const steps = await loadStepsByUnit(athleteId, unitIds);
  for (const [unitId, unitSteps] of steps) {
    byUnit.set(
      unitId,
      unitSteps.flatMap((s) => s.exercises),
    );
  }
  return byUnit;
}

// The resolved calendar week: weekly pattern of ACTIVE plans (inside their
// activation window) merged with per-date overrides, plus the week's logged
// sessions for the ✓ markers.
export async function loadWeekSchedule(athleteId: string, weekStart: string) {
  const dates = weekDates(weekStart);
  const [start, end] = [dates[0], dates[6]];

  const assignmentRows = await db
    .select({
      dayOfWeek: trainingPlanUnitDays.dayOfWeek,
      unitId: trainingPlanUnits.id,
      planId: trainingPlans.id,
      planName: trainingPlans.name,
      name: trainingPlanUnits.name,
      sessionType: trainingPlanUnits.sessionType,
      intensity: trainingPlanUnits.intensity,
      training: trainingPlanUnits.training,
      goal: trainingPlanUnits.goal,
      activeFrom: trainingPlans.startDate,
      activeTo: trainingPlans.endDate,
    })
    .from(trainingPlanUnitDays)
    .innerJoin(trainingPlanUnits, eq(trainingPlanUnitDays.unitId, trainingPlanUnits.id))
    .innerJoin(trainingPlans, eq(trainingPlanUnits.planId, trainingPlans.id))
    .where(and(eq(trainingPlanUnitDays.athleteId, athleteId), eq(trainingPlans.status, "ACTIVE")))
    .orderBy(asc(trainingPlanUnitDays.dayOfWeek), asc(trainingPlanUnits.orderIndex));

  // ADD/ADHOC render regardless of plan status (placed by hand); the unit
  // join only supplies content and vanishes with the unit (cascade).
  const overrideRows = await db
    .select({
      id: scheduleOverrides.id,
      date: scheduleOverrides.date,
      kind: scheduleOverrides.kind,
      overrideUnitId: scheduleOverrides.unitId,
      overrideSessionType: scheduleOverrides.sessionType,
      overrideName: scheduleOverrides.name,
      note: scheduleOverrides.note,
      unitId: trainingPlanUnits.id,
      planId: trainingPlans.id,
      planName: trainingPlans.name,
      name: trainingPlanUnits.name,
      sessionType: trainingPlanUnits.sessionType,
      intensity: trainingPlanUnits.intensity,
      training: trainingPlanUnits.training,
      goal: trainingPlanUnits.goal,
    })
    .from(scheduleOverrides)
    .leftJoin(trainingPlanUnits, eq(scheduleOverrides.unitId, trainingPlanUnits.id))
    .leftJoin(trainingPlans, eq(trainingPlanUnits.planId, trainingPlans.id))
    .where(
      and(
        eq(scheduleOverrides.athleteId, athleteId),
        gte(scheduleOverrides.date, start),
        lte(scheduleOverrides.date, end),
      ),
    )
    .orderBy(asc(scheduleOverrides.createdAt));

  const unitIds = [
    ...new Set([...assignmentRows.map((r) => r.unitId), ...overrideRows.flatMap((r) => (r.unitId ? [r.unitId] : []))]),
  ];
  const exByUnit = await loadExercisesByUnit(athleteId, unitIds);

  const toUnit = (row: {
    unitId: string;
    planId: string | null;
    planName: string | null;
    name: string;
    sessionType: ScheduleUnit["sessionType"];
    intensity: ScheduleUnit["intensity"];
    training: string;
    goal: string | null;
  }): ScheduleUnit => ({
    unitId: row.unitId,
    planId: row.planId ?? "",
    planName: row.planName ?? "",
    name: row.name,
    sessionType: row.sessionType,
    intensity: row.intensity,
    training: row.training,
    goal: row.goal,
    exercises: exByUnit.get(row.unitId) ?? [],
  });

  const assignments: WeekAssignment[] = assignmentRows.map((r) => ({
    dayOfWeek: r.dayOfWeek,
    unit: toUnit(r),
    activeFrom: r.activeFrom,
    activeTo: r.activeTo,
  }));

  const overrides: WeekOverride[] = overrideRows.map((r) => ({
    id: r.id,
    date: r.date,
    kind: r.kind,
    unitId: r.overrideUnitId,
    // Joined columns are nullable to TS, but a non-null unit id guarantees
    // the unit row (inner FK); plan fields fall back defensively.
    unit:
      r.unitId && r.sessionType && r.intensity
        ? toUnit({
            unitId: r.unitId,
            planId: r.planId,
            planName: r.planName,
            name: r.name ?? "",
            sessionType: r.sessionType,
            intensity: r.intensity,
            training: r.training ?? "",
            goal: r.goal,
          })
        : null,
    sessionType: r.overrideSessionType,
    name: r.overrideName,
    note: r.note,
  }));

  // Done markers: FINISHED sessions only — an in-progress session isn't a
  // completed workout yet.
  const sessionRows = await db
    .select({ id: sessions.id, date: sessions.date, type: sessions.type, title: sessions.title })
    .from(sessions)
    .where(
      and(
        eq(sessions.athleteId, athleteId),
        isNotNull(sessions.endedAt),
        gte(sessions.date, start),
        lte(sessions.date, end),
      ),
    )
    .orderBy(asc(sessions.startedAt));

  return {
    weekStart,
    dates,
    entries: resolveWeek(dates, assignments, overrides),
    sessions: sessionRows,
  };
}

// The plan library: every plan with its ordered units, their assigned
// weekdays and exercises. Feeds the "Moje plany" tab + activation prefill.
export async function loadPlans(athleteId: string) {
  const planRows = await db
    .select({
      id: trainingPlans.id,
      name: trainingPlans.name,
      description: trainingPlans.description,
      status: trainingPlans.status,
      startDate: trainingPlans.startDate,
      endDate: trainingPlans.endDate,
    })
    .from(trainingPlans)
    .where(eq(trainingPlans.athleteId, athleteId))
    .orderBy(desc(trainingPlans.createdAt));
  if (planRows.length === 0) return [];

  const unitRows = await db
    .select({
      id: trainingPlanUnits.id,
      planId: trainingPlanUnits.planId,
      name: trainingPlanUnits.name,
      sessionType: trainingPlanUnits.sessionType,
      intensity: trainingPlanUnits.intensity,
      training: trainingPlanUnits.training,
      goal: trainingPlanUnits.goal,
    })
    .from(trainingPlanUnits)
    .where(eq(trainingPlanUnits.athleteId, athleteId))
    .orderBy(asc(trainingPlanUnits.planId), asc(trainingPlanUnits.orderIndex));

  const dayRows = await db
    .select({ unitId: trainingPlanUnitDays.unitId, dayOfWeek: trainingPlanUnitDays.dayOfWeek })
    .from(trainingPlanUnitDays)
    .where(eq(trainingPlanUnitDays.athleteId, athleteId))
    .orderBy(asc(trainingPlanUnitDays.dayOfWeek));

  const stepsByUnit = await loadStepsByUnit(
    athleteId,
    unitRows.map((u) => u.id),
  );
  const daysByUnit = new Map<string, number[]>();
  for (const row of dayRows) {
    const arr = daysByUnit.get(row.unitId) ?? [];
    arr.push(row.dayOfWeek);
    daysByUnit.set(row.unitId, arr);
  }

  return planRows.map((plan) => ({
    ...plan,
    units: unitRows
      .filter((u) => u.planId === plan.id)
      .map(({ planId: _planId, ...u }) => {
        const steps = stepsByUnit.get(u.id) ?? [];
        return {
          ...u,
          days: daysByUnit.get(u.id) ?? [],
          steps,
          // Flattened for compact displays (library preview, activation).
          exercises: steps.flatMap((s) => s.exercises),
        };
      }),
  }));
}

// STRENGTH units of ACTIVE plans that can seed a session (≥1 exercise), with
// a "today" flag from the RESOLVED schedule — a unit dragged onto today
// counts as today's.
export async function loadStartableUnits(athleteId: string) {
  const unitRows = await db
    .select({
      id: trainingPlanUnits.id,
      name: trainingPlanUnits.name,
      planName: trainingPlans.name,
    })
    .from(trainingPlanUnits)
    .innerJoin(trainingPlans, eq(trainingPlanUnits.planId, trainingPlans.id))
    .where(
      and(
        eq(trainingPlanUnits.athleteId, athleteId),
        eq(trainingPlanUnits.sessionType, "STRENGTH"),
        eq(trainingPlans.status, "ACTIVE"),
      ),
    )
    .orderBy(desc(trainingPlans.createdAt), asc(trainingPlanUnits.orderIndex));
  if (unitRows.length === 0) return [];

  const exByUnit = await loadExercisesByUnit(
    athleteId,
    unitRows.map((u) => u.id),
  );
  const today = warsawTodayIso();
  const { entries } = await loadWeekSchedule(athleteId, weekStartIso(today));
  const todayUnitIds = new Set(entries.filter((e) => e.date === today && e.unitId).map((e) => e.unitId));

  return unitRows
    .map((u) => ({ ...u, exercises: exByUnit.get(u.id) ?? [], todayAssigned: todayUnitIds.has(u.id) }))
    .filter((u) => u.exercises.length > 0);
}

// Ordered steps of one unit in the seed shape createSession materializes.
// Scoped by athlete; any owned unit is seedable regardless of its plan's
// status, which preserves the "run any unit on any day" flexibility.
export async function loadUnitSteps(athleteId: string, unitId: string) {
  const byUnit = await loadStepsByUnit(athleteId, [unitId]);
  return (byUnit.get(unitId) ?? []).map((s) => ({
    kind: s.kind,
    targetRounds: s.targetRounds,
    durationSeconds: s.durationSeconds,
    note: s.note,
    exerciseIds: s.exercises.map((e) => e.exerciseId),
  }));
}
