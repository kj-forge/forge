import { describe, expect, test } from "bun:test";

import { resolveIsDark } from "./theme";

describe("resolveIsDark", () => {
  test("explicit choices are absolute", () => {
    expect(resolveIsDark("dark", false)).toBe(true);
    expect(resolveIsDark("light", true)).toBe(false);
  });

  test("auto follows the device default (dark on mobile, light on desktop)", () => {
    expect(resolveIsDark("system", true)).toBe(true);
    expect(resolveIsDark("system", false)).toBe(false);
  });
});
