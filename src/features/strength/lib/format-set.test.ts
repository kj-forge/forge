import { describe, expect, test } from "bun:test";

import { formatSeriesCount } from "./format-set";

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
