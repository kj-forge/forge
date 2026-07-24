import { describe, expect, test } from "bun:test";

import { formatRoundsCount, formatRoundsSaved, formatSeriesCount, formatSet } from "./format-set";

describe("formatSet — duration sets", () => {
  test("duration-only set renders seconds", () => {
    expect(formatSet({ reps: null, weightKg: null, durationSeconds: 30 })).toBe("30s");
  });

  test("reps win when both present (defensive)", () => {
    expect(formatSet({ reps: 10, weightKg: null, durationSeconds: 30 })).toBe("10× bw");
  });

  test("no durationSeconds key keeps old behavior", () => {
    expect(formatSet({ reps: 5, weightKg: 100 })).toBe("5× 100kg");
  });
});

describe("formatRoundsCount / formatRoundsSaved", () => {
  test("Polish plurals", () => {
    expect(formatRoundsCount(1)).toBe("1 runda");
    expect(formatRoundsCount(3)).toBe("3 rundy");
    expect(formatRoundsCount(5)).toBe("5 rund");
    expect(formatRoundsCount(12)).toBe("12 rund");
    expect(formatRoundsCount(22)).toBe("22 rundy");
    expect(formatRoundsSaved(1)).toBe("1 runda zapisana");
    expect(formatRoundsSaved(4)).toBe("4 rundy zapisane");
    expect(formatRoundsSaved(14)).toBe("14 rund zapisanych");
  });
});

describe("formatSeriesCount", () => {
  test("polish plural forms", () => {
    expect(formatSeriesCount(1)).toBe("1 seria");
    expect(formatSeriesCount(2)).toBe("2 serie");
    expect(formatSeriesCount(4)).toBe("4 serie");
    expect(formatSeriesCount(5)).toBe("5 serii");
    expect(formatSeriesCount(11)).toBe("11 serii");
    expect(formatSeriesCount(12)).toBe("12 serii");
    expect(formatSeriesCount(14)).toBe("14 serii");
    expect(formatSeriesCount(21)).toBe("21 serii");
    expect(formatSeriesCount(22)).toBe("22 serie");
  });
});
