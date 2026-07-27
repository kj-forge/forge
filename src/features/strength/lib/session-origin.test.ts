import { describe, expect, test } from "bun:test";

import { readSessionOrigin } from "./session-origin";

describe("readSessionOrigin", () => {
  test("reads dziennik", () => {
    expect(readSessionOrigin({ sessionOrigin: "dziennik" })).toBe("dziennik");
  });

  test("reads historia", () => {
    expect(readSessionOrigin({ sessionOrigin: "historia" })).toBe("historia");
  });

  test("falls back to historia for null, empty, or unknown values", () => {
    expect(readSessionOrigin(null)).toBe("historia");
    expect(readSessionOrigin({})).toBe("historia");
    expect(readSessionOrigin({ sessionOrigin: "x" })).toBe("historia");
  });
});
