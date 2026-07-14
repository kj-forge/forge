import { describe, expect, test } from "bun:test";

import { resolveIsDark } from "./theme";

describe("resolveIsDark", () => {
  test("explicit choices ignore the system", () => {
    expect(resolveIsDark("dark", false)).toBe(true);
    expect(resolveIsDark("light", true)).toBe(false);
  });

  test("system follows the OS preference", () => {
    expect(resolveIsDark("system", true)).toBe(true);
    expect(resolveIsDark("system", false)).toBe(false);
  });
});
