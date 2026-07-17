import { describe, expect, test } from "bun:test";

import { bestE1RM, bestSet, isNewPR } from "./pr";

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

describe("bestE1RM", () => {
  test("picks the highest e1RM, not the heaviest set", () => {
    // 110×1 → 110, but 100×10 → ~133.5 is the real record
    const sets = [
      { weightKg: 110, reps: 1, kind: "TOP_SET" },
      { weightKg: 100, reps: 10, kind: "WORK" },
    ];
    expect(bestE1RM(sets)).toBe(133.5);
  });

  test("ignores warmups and incomplete sets, null when nothing qualifies", () => {
    expect(bestE1RM([{ weightKg: 120, reps: 1, kind: "WARMUP" }])).toBeNull();
    expect(bestE1RM([{ weightKg: null, reps: 12, kind: "WORK" }])).toBeNull();
    expect(bestE1RM([])).toBeNull();
  });
});

describe("isNewPR", () => {
  test("true when no previous best exists", () => {
    expect(isNewPR({ weightKg: 60, reps: 5 }, null)).toBe(true);
  });

  test("a record is real weight on the bar — 130×1 beats 129×5", () => {
    expect(isNewPR({ weightKg: 130, reps: 1 }, { weightKg: 129, reps: 5 })).toBe(true);
    // and the reverse is NOT a record, whatever Epley says
    expect(isNewPR({ weightKg: 129, reps: 5 }, { weightKg: 130, reps: 1 })).toBe(false);
  });

  test("same weight needs strictly more reps", () => {
    expect(isNewPR({ weightKg: 130, reps: 3 }, { weightKg: 130, reps: 1 })).toBe(true);
    expect(isNewPR({ weightKg: 130, reps: 3 }, { weightKg: 130, reps: 3 })).toBe(false);
  });

  test("false when candidate is weaker", () => {
    expect(isNewPR({ weightKg: 95, reps: 5 }, { weightKg: 100, reps: 5 })).toBe(false);
  });
});
