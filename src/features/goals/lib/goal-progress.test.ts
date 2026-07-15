import { describe, expect, test } from "bun:test";

import { formatGoalTarget, goalProgress } from "./goal-progress";

describe("goalProgress", () => {
  test("percent of target, rounded", () => {
    expect(goalProgress(140, 131)).toBe(94);
    expect(goalProgress(100, 50)).toBe(50);
  });

  test("clamps at 100 when the target is beaten", () => {
    expect(goalProgress(100, 120)).toBe(100);
  });

  test("null when target or current is missing or nonsense", () => {
    expect(goalProgress(null, 131)).toBeNull();
    expect(goalProgress(140, null)).toBeNull();
    expect(goalProgress(0, 10)).toBeNull();
    expect(goalProgress(-5, 10)).toBeNull();
  });
});

describe("formatGoalTarget", () => {
  test("seconds humanize to minutes (Hyrox Sub-65 is 3900 s)", () => {
    expect(formatGoalTarget(3900, "seconds")).toBe("65 min");
    expect(formatGoalTarget(90, "s")).toBe("1.5 min");
  });

  test("other units pass through", () => {
    expect(formatGoalTarget(100, "kg")).toBe("100 kg");
    expect(formatGoalTarget(20, "min")).toBe("20 min");
    expect(formatGoalTarget(100, null)).toBe("100");
  });

  test("null without a value", () => {
    expect(formatGoalTarget(null, "kg")).toBeNull();
  });
});
