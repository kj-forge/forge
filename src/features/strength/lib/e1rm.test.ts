import { describe, expect, test } from "bun:test";

import { epleyE1RM } from "./e1rm";

describe("epleyE1RM", () => {
  test("single rep returns the weight itself", () => {
    expect(epleyE1RM(100, 1)).toBe(100);
    expect(epleyE1RM(142.5, 1)).toBe(142.5);
  });

  test("known Epley values", () => {
    // 100 × (1 + 3/30) = 110
    expect(epleyE1RM(100, 3)).toBe(110);
    // 60 × (1 + 10/30) = 80
    expect(epleyE1RM(60, 10)).toBe(80);
  });

  test("rounds to the nearest 0.5 kg", () => {
    // 100 × (1 + 5/30) = 116.666… → 116.5
    expect(epleyE1RM(100, 5)).toBe(116.5);
    // 100 × (1 + 7/30) = 123.333… → 123.5
    expect(epleyE1RM(100, 7)).toBe(123.5);
    // 112.5 × (1 + 5/30) = 131.25 → 131.5
    expect(epleyE1RM(112.5, 5)).toBe(131.5);
  });

  test("zero weight is allowed", () => {
    expect(epleyE1RM(0, 5)).toBe(0);
  });

  test("rejects reps below 1 and negative weight", () => {
    expect(() => epleyE1RM(100, 0)).toThrow(RangeError);
    expect(() => epleyE1RM(100, -1)).toThrow(RangeError);
    expect(() => epleyE1RM(-5, 5)).toThrow(RangeError);
  });
});
