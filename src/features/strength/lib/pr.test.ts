import { describe, expect, test } from "bun:test";

import { bestSet, isNewPR } from "./pr";

describe("bestSet", () => {
  test("picks the heaviest set by weight, then reps", () => {
    const sets = [
      { weightKg: 100, reps: 5, kind: "WORK" },
      { weightKg: 110, reps: 3, kind: "TOP_SET" },
      { weightKg: 110, reps: 5, kind: "WORK" },
    ];
    expect(bestSet(sets)).toEqual({ weightKg: 110, reps: 5 });
  });

  test("ignores warmup sets even when heavier", () => {
    const sets = [
      { weightKg: 120, reps: 1, kind: "WARMUP" },
      { weightKg: 100, reps: 5, kind: "TOP_SET" },
    ];
    expect(bestSet(sets)).toEqual({ weightKg: 100, reps: 5 });
  });

  test("ignores bodyweight (null-weight) and null-rep sets", () => {
    const sets = [
      { weightKg: null, reps: 12, kind: "WORK" },
      { weightKg: 80, reps: null, kind: "WORK" },
      { weightKg: 70, reps: 8, kind: "WORK" },
    ];
    expect(bestSet(sets)).toEqual({ weightKg: 70, reps: 8 });
  });

  test("returns null when nothing qualifies", () => {
    expect(bestSet([])).toBeNull();
    expect(bestSet([{ weightKg: null, reps: 10, kind: "WORK" }])).toBeNull();
    expect(bestSet([{ weightKg: 100, reps: 1, kind: "WARMUP" }])).toBeNull();
  });
});

describe("isNewPR", () => {
  test("true when no previous best exists", () => {
    expect(isNewPR({ weightKg: 60, reps: 5 }, null)).toBe(true);
  });

  test("true when candidate e1RM beats the previous best", () => {
    // 105×5 → e1RM 122.5 vs 100×5 → 116.5
    expect(isNewPR({ weightKg: 105, reps: 5 }, { weightKg: 100, reps: 5 })).toBe(true);
    // more reps at the same weight also count: 100×8 (126.5) vs 100×5 (116.5)
    expect(isNewPR({ weightKg: 100, reps: 8 }, { weightKg: 100, reps: 5 })).toBe(true);
  });

  test("false on equal e1RM", () => {
    expect(isNewPR({ weightKg: 100, reps: 5 }, { weightKg: 100, reps: 5 })).toBe(false);
  });

  test("false when candidate is weaker", () => {
    expect(isNewPR({ weightKg: 95, reps: 5 }, { weightKg: 100, reps: 5 })).toBe(false);
  });
});
