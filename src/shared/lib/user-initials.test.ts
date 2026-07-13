import { describe, expect, test } from "bun:test";

import { userInitials } from "./user-initials";

describe("userInitials", () => {
  test("two-word name → two initials", () => {
    expect(userInitials("Krzysztof Jakubiak", null)).toBe("KJ");
  });

  test("single-word name → one initial", () => {
    expect(userInitials("Krzysztof", null)).toBe("K");
  });

  test("extra words ignored beyond two", () => {
    expect(userInitials("Jan Maria Rokita", null)).toBe("JM");
  });

  test("no name → first letter of email", () => {
    expect(userInitials(null, "jakubiak.krzy@gmail.com")).toBe("J");
    expect(userInitials("  ", "jakubiak.krzy@gmail.com")).toBe("J");
  });

  test("nothing → question mark", () => {
    expect(userInitials(null, null)).toBe("?");
    expect(userInitials(undefined, undefined)).toBe("?");
  });
});
