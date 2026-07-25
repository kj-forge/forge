import { describe, expect, test } from "bun:test";

import {
  resolveWeek,
  type ScheduleUnit,
  shiftWeeks,
  type WeekOverride,
  weekDates,
  weekdayOfIso,
  weekStartIso,
} from "./schedule";

const unit = (over: Partial<ScheduleUnit> = {}): ScheduleUnit => ({
  unitId: "u1",
  planId: "p1",
  planName: "Hardy Method",
  name: "Trening A",
  sessionType: "STRENGTH",
  intensity: "HARD",
  training: "Siła góra",
  goal: null,
  exercises: [],
  ...over,
});

const assignment = (dayOfWeek: number, u: ScheduleUnit = unit(), window: { from?: string; to?: string } = {}) => ({
  dayOfWeek,
  unit: u,
  activeFrom: window.from ?? null,
  activeTo: window.to ?? null,
  slot: "MORNING" as const,
});

const override = (over: Partial<WeekOverride> & Pick<WeekOverride, "id" | "date" | "kind">): WeekOverride => ({
  unitId: null,
  unit: null,
  sessionType: null,
  name: null,
  note: null,
  slot: "MORNING",
  ...over,
});

// Week of Mon 2026-07-13 … Sun 2026-07-19.
const DATES = weekDates("2026-07-13");

describe("week date helpers", () => {
  test("weekStartIso finds Monday for any weekday", () => {
    expect(weekStartIso("2026-07-13")).toBe("2026-07-13"); // Monday itself
    expect(weekStartIso("2026-07-16")).toBe("2026-07-13"); // Thursday
    expect(weekStartIso("2026-07-19")).toBe("2026-07-13"); // Sunday
  });

  test("weekDates returns the 7 consecutive days", () => {
    expect(DATES).toHaveLength(7);
    expect(DATES[0]).toBe("2026-07-13");
    expect(DATES[6]).toBe("2026-07-19");
  });

  test("shiftWeeks moves whole weeks in both directions", () => {
    expect(shiftWeeks("2026-07-13", 1)).toBe("2026-07-20");
    expect(shiftWeeks("2026-07-13", -1)).toBe("2026-07-06");
  });

  test("weekdayOfIso is Monday-first", () => {
    expect(weekdayOfIso("2026-07-13")).toBe(0); // Monday
    expect(weekdayOfIso("2026-07-18")).toBe(5); // Saturday
    expect(weekdayOfIso("2026-07-19")).toBe(6); // Sunday
  });
});

describe("resolveWeek", () => {
  test("expands the weekly pattern onto dates", () => {
    const entries = resolveWeek(DATES, [assignment(1)], []);
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe("2026-07-14");
    expect(entries[0].source).toBe("PLAN");
    expect(entries[0].planName).toBe("Hardy Method");
  });

  test("SKIP removes a plan unit from one date only", () => {
    const entries = resolveWeek(
      DATES,
      [assignment(1)],
      [override({ id: "o1", date: "2026-07-14", kind: "SKIP", unitId: "u1" })],
    );
    expect(entries).toHaveLength(0);
  });

  test("SKIP for another unit leaves the entry alone", () => {
    const entries = resolveWeek(
      DATES,
      [assignment(1)],
      [override({ id: "o1", date: "2026-07-14", kind: "SKIP", unitId: "other" })],
    );
    expect(entries).toHaveLength(1);
  });

  test("a drag = SKIP + ADD pair moves the unit within the week", () => {
    const entries = resolveWeek(
      DATES,
      [assignment(1)],
      [
        override({ id: "o1", date: "2026-07-14", kind: "SKIP", unitId: "u1" }),
        override({ id: "o2", date: "2026-07-15", kind: "ADD", unitId: "u1", unit: unit() }),
      ],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe("2026-07-15");
    expect(entries[0].source).toBe("ADD");
    expect(entries[0].overrideId).toBe("o2");
  });

  test("two units from different plans share a day", () => {
    const entries = resolveWeek(
      DATES,
      [
        assignment(1),
        assignment(1, unit({ unitId: "u2", planId: "p2", planName: "Baza tlenowa", sessionType: "RUNNING" })),
      ],
      [],
    );
    expect(entries.map((e) => e.planName)).toEqual(["Hardy Method", "Baza tlenowa"]);
  });

  test("plan entries respect the activation window; ADDs don't", () => {
    const entries = resolveWeek(
      DATES,
      // Active only from Thursday — Tuesday's slot must not render.
      [assignment(1, unit(), { from: "2026-07-16" })],
      [override({ id: "o1", date: "2026-07-14", kind: "ADD", unitId: "u1", unit: unit() })],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("ADD");

    const expired = resolveWeek(DATES, [assignment(1, unit(), { to: "2026-07-13" })], []);
    expect(expired).toHaveLength(0);
  });

  test("ADHOC renders without unit fields", () => {
    const entries = resolveWeek(
      DATES,
      [],
      [
        override({
          id: "o1",
          date: "2026-07-18",
          kind: "ADHOC",
          sessionType: "OTHER",
          name: "Pływanie",
          note: "luźno",
        }),
      ],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: "ADHOC", unitId: null, name: "Pływanie", note: "luźno" });
  });

  test("overrides outside the week's dates are ignored", () => {
    const entries = resolveWeek(
      DATES,
      [assignment(1)],
      [
        override({ id: "o1", date: "2026-07-21", kind: "SKIP", unitId: "u1" }),
        override({ id: "o2", date: "2026-07-22", kind: "ADD", unitId: "u1", unit: unit() }),
      ],
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe("2026-07-14");
  });
});

describe("resolveWeek — day slots", () => {
  const unit = (unitId: string): ScheduleUnit => ({
    unitId,
    planId: "p1",
    planName: "Plan",
    name: unitId,
    sessionType: "STRENGTH",
    intensity: "MEDIUM",
    training: "",
    goal: null,
    exercises: [],
  });
  const dates = weekDates("2026-07-20");

  test("evening plan entry sorts after a morning ADD on the same day", () => {
    const entries = resolveWeek(
      dates,
      [{ dayOfWeek: 0, unit: unit("u-evening"), activeFrom: null, activeTo: null, slot: "EVENING" }],
      [
        {
          id: "o1",
          date: "2026-07-20",
          kind: "ADD",
          unitId: "u-morning",
          unit: unit("u-morning"),
          sessionType: null,
          name: null,
          note: null,
          slot: "MORNING",
        },
      ],
    );
    expect(entries.map((e) => e.unitId)).toEqual(["u-morning", "u-evening"]);
    expect(entries[0].slot).toBe("MORNING");
  });
});
