import { describe, expect, test } from "bun:test";

import { WEEKDAY_FULL_PL, WEEKDAY_LABELS_PL, warsawWeekday } from "./weekday";

describe("WEEKDAY_LABELS_PL", () => {
  test("PON through ND", () => {
    expect(WEEKDAY_LABELS_PL).toEqual(["PON", "WTO", "ŚRO", "CZW", "PT", "SOB", "ND"]);
  });
});

describe("WEEKDAY_FULL_PL", () => {
  test("full names aligned with the short labels", () => {
    expect(WEEKDAY_FULL_PL).toEqual(["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"]);
    expect(WEEKDAY_FULL_PL.length).toBe(WEEKDAY_LABELS_PL.length);
  });
});

describe("warsawWeekday", () => {
  test("plain UTC afternoon maps directly", () => {
    // 2026-07-14 is a Tuesday
    expect(warsawWeekday(new Date("2026-07-14T12:00:00Z"))).toBe(1);
  });

  test("late UTC evening already belongs to the next Warsaw day", () => {
    // 23:30 UTC Monday = 01:30 Tuesday in Warsaw (CEST, UTC+2)
    expect(warsawWeekday(new Date("2026-07-13T23:30:00Z"))).toBe(1);
  });

  test("sunday is 6", () => {
    expect(warsawWeekday(new Date("2026-07-19T10:00:00Z"))).toBe(6);
  });
});
