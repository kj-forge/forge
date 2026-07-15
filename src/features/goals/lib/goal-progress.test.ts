import { describe, expect, test } from "bun:test";

import { goalProgress } from "./goal-progress";

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
