import { describe, expect, test } from "bun:test";

import { formatSetsCompact } from "./format-sets-compact";

const set = (weightKg: number | null, reps: number, kind = "WORK") => ({ weightKg, reps, kind });

describe("formatSetsCompact", () => {
  test("equal sets at one weight collapse to N×R", () => {
    const sets = [set(105, 5), set(105, 5), set(105, 5), set(105, 5)];
    expect(formatSetsCompact(sets)).toBe("105 4×5");
  });

  test("single set at a weight shows ×R", () => {
    expect(formatSetsCompact([set(112.5, 3)])).toBe("112.5 ×3");
  });

  test("varied reps join with slashes", () => {
    const sets = [set(110, 3), set(110, 3), set(110, 3), set(110, 5)];
    expect(formatSetsCompact(sets)).toBe("110 3/3/3/5");
  });

  test("bodyweight sets show reps only", () => {
    const sets = [set(null, 12), set(null, 12), set(null, 10)];
    expect(formatSetsCompact(sets)).toBe("12/12/10");
  });

  test("weight groups separated by · in order of appearance", () => {
    const sets = [set(50, 8), set(50, 7), set(50, 6), set(50, 6), set(40, 10)];
    expect(formatSetsCompact(sets)).toBe("50 8/7/6/6 · 40 ×10");
  });

  test("loaded bodyweight renders weight as +kg", () => {
    const sets = [set(20, 8), set(20, 8), set(null, 12)];
    expect(formatSetsCompact(sets, { loadedBodyweight: true })).toBe("+20 2×8 · ×12");
  });

  test("warmups are excluded", () => {
    const sets = [set(60, 10, "WARMUP"), set(90, 5, "WARMUP"), set(105, 5), set(105, 5)];
    expect(formatSetsCompact(sets)).toBe("105 2×5");
  });

  test("nothing to show renders an em dash", () => {
    expect(formatSetsCompact([])).toBe("—");
    expect(formatSetsCompact([set(60, 10, "WARMUP")])).toBe("—");
  });
});
