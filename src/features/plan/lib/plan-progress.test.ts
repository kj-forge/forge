import { describe, expect, test } from "bun:test";

import { planWeekProgress } from "./plan-progress";

// 12-week window: 2026-01-01 .. 2026-03-25 (84 inclusive days).
const START = "2026-01-01";
const END = "2026-03-25";

describe("planWeekProgress", () => {
  test("mid-range day lands on its week", () => {
    expect(planWeekProgress(START, END, "2026-01-08")).toEqual({ week: 2, totalWeeks: 12 });
  });

  test("first day is week 1", () => {
    expect(planWeekProgress(START, END, START)).toEqual({ week: 1, totalWeeks: 12 });
  });

  test("after end is null", () => {
    expect(planWeekProgress(START, END, "2026-03-26")).toBeNull();
  });

  test("missing endDate is null", () => {
    expect(planWeekProgress(START, null, "2026-01-08")).toBeNull();
  });

  test("before start is null", () => {
    expect(planWeekProgress(START, END, "2025-12-31")).toBeNull();
  });
});
