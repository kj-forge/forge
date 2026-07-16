import { describe, expect, test } from "bun:test";

import { parseAliases } from "./exercise-form";

describe("parseAliases", () => {
  test("splits on commas, trims, drops empties", () => {
    expect(parseAliases("siady, przysiady,, BS ")).toEqual(["siady", "przysiady", "BS"]);
  });

  test("empty input gives an empty list", () => {
    expect(parseAliases("")).toEqual([]);
    expect(parseAliases("  ,  ,")).toEqual([]);
  });

  test("caps at 10 aliases", () => {
    const many = Array.from({ length: 15 }, (_, i) => `a${i}`).join(",");
    expect(parseAliases(many)).toHaveLength(10);
  });
});
