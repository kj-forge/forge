import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import type { SessionType } from "@/features/strength/types";
import type { UnitIntensity } from "../constants";

dayjs.extend(utc);
dayjs.extend(timezone);

// The athlete's calendar is Warsaw time — loaders run on the server during
// SSR, so the zone must be pinned instead of trusting the runtime's local
// time (same reasoning as warsawWeekday).
export function warsawTodayIso(now: Date = new Date()): string {
  return dayjs(now).tz("Europe/Warsaw").format("YYYY-MM-DD");
}

// Monday of the week containing dateIso (Monday-first indexing).
export function weekStartIso(dateIso: string): string {
  const d = dayjs(dateIso);
  return d.subtract((d.day() + 6) % 7, "day").format("YYYY-MM-DD");
}

export function weekDates(weekStart: string): string[] {
  const start = dayjs(weekStart);
  return Array.from({ length: 7 }, (_, i) => start.add(i, "day").format("YYYY-MM-DD"));
}

// Monday-first weekday index of an ISO date (same convention as
// warsawWeekday, but for a calendar date instead of "now").
export function weekdayOfIso(dateIso: string): number {
  return (dayjs(dateIso).day() + 6) % 7;
}

export function shiftWeeks(weekStart: string, weeks: number): string {
  return dayjs(weekStart)
    .add(weeks * 7, "day")
    .format("YYYY-MM-DD");
}

export interface ScheduleExercise {
  exerciseId: string;
  namePl: string;
}

// Unit content as it appears in the schedule — flattened with its plan label.
export interface ScheduleUnit {
  unitId: string;
  planId: string;
  planName: string;
  name: string;
  sessionType: SessionType;
  intensity: UnitIntensity;
  training: string;
  goal: string | null;
  exercises: ScheduleExercise[];
}

// One rendered schedule row. PLAN = from the weekly pattern; ADD = a unit
// placed on a specific date; ADHOC = a free-form one-off (no unit fields).
export interface ScheduleEntry {
  date: string;
  source: "PLAN" | "ADD" | "ADHOC";
  overrideId: string | null;
  unitId: string | null;
  planId: string | null;
  planName: string | null;
  name: string;
  sessionType: SessionType;
  intensity: UnitIntensity | null;
  training: string;
  goal: string | null;
  note: string | null;
  exercises: ScheduleExercise[];
}

export interface WeekAssignment {
  dayOfWeek: number;
  unit: ScheduleUnit;
  // Plan's activation window; null = unbounded. ISO dates compare
  // lexicographically, so plain string comparison is safe.
  activeFrom: string | null;
  activeTo: string | null;
}

export interface WeekOverride {
  id: string;
  date: string;
  kind: "SKIP" | "ADD" | "ADHOC";
  unitId: string | null;
  // Joined unit content; present for ADD (an ADD whose unit vanished is
  // dropped by the query), null for SKIP/ADHOC.
  unit: ScheduleUnit | null;
  sessionType: SessionType | null;
  name: string | null;
  note: string | null;
}

// Pure merge of the weekly pattern with per-date exceptions, day by day:
// assignments for the weekday − SKIPs + ADDs + ADHOCs. dates must be the
// Monday-first week (index = dayOfWeek).
export function resolveWeek(
  dates: string[],
  assignments: WeekAssignment[],
  overrides: WeekOverride[],
): ScheduleEntry[] {
  const skipped = new Set(overrides.filter((o) => o.kind === "SKIP" && o.unitId).map((o) => `${o.unitId}:${o.date}`));
  const entries: ScheduleEntry[] = [];
  dates.forEach((date, dayOfWeek) => {
    for (const a of assignments) {
      if (a.dayOfWeek !== dayOfWeek || skipped.has(`${a.unit.unitId}:${date}`)) continue;
      if (a.activeFrom && date < a.activeFrom) continue;
      if (a.activeTo && date > a.activeTo) continue;
      entries.push({ date, source: "PLAN", overrideId: null, note: null, ...a.unit });
    }
    for (const o of overrides) {
      if (o.date !== date) continue;
      if (o.kind === "ADD" && o.unit) {
        entries.push({ date, source: "ADD", overrideId: o.id, note: o.note, ...o.unit });
      } else if (o.kind === "ADHOC") {
        entries.push({
          date,
          source: "ADHOC",
          overrideId: o.id,
          unitId: null,
          planId: null,
          planName: null,
          name: o.name ?? "Trening",
          sessionType: o.sessionType ?? "OTHER",
          intensity: null,
          training: "",
          goal: null,
          note: o.note,
          exercises: [],
        });
      }
    }
  });
  return entries;
}
