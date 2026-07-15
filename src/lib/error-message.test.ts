import { describe, expect, test } from "bun:test";

import { getErrorMessage } from "./error-message";

describe("getErrorMessage", () => {
  test("returns a domain Error's message", () => {
    expect(getErrorMessage(new Error("Nie znaleziono sesji."), "fallback")).toBe("Nie znaleziono sesji.");
  });

  test("falls back on network TypeErrors", () => {
    expect(getErrorMessage(new TypeError("Failed to fetch"), "fallback")).toBe("fallback");
  });

  test("falls back on a leaked serialized (JSON) error dump", () => {
    const zodDump = '[{"origin":"string","code":"too_small","path":["training"]}]';
    expect(getErrorMessage(new Error(zodDump), "fallback")).toBe("fallback");
    expect(getErrorMessage(new Error('{"code":"x"}'), "fallback")).toBe("fallback");
  });

  test("falls back on non-Error values and empty messages", () => {
    expect(getErrorMessage("boom", "fallback")).toBe("fallback");
    expect(getErrorMessage(new Error("   "), "fallback")).toBe("fallback");
  });
});
