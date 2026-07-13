import { describe, expect, test } from "bun:test";

import { NAV_ITEMS, showsTabBar } from "./nav";

describe("showsTabBar", () => {
  test("visible on the four top-level destinations", () => {
    expect(showsTabBar("/")).toBe(true);
    expect(showsTabBar("/sessions")).toBe(true);
    expect(showsTabBar("/sessions/")).toBe(true);
    expect(showsTabBar("/sessions/new")).toBe(true);
    expect(showsTabBar("/me")).toBe(true);
  });

  test("hidden inside a session detail", () => {
    expect(showsTabBar("/sessions/123e4567-e89b-12d3-a456-426614174000")).toBe(false);
  });

  test("hidden on unknown routes (fail closed)", () => {
    expect(showsTabBar("/login")).toBe(false);
  });
});

describe("NAV_ITEMS", () => {
  test("four tabs in thumb order", () => {
    expect(NAV_ITEMS.map((i) => i.to)).toEqual(["/", "/sessions", "/sessions/new", "/me"]);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Dziennik", "Historia", "Nowa", "Profil"]);
  });
});
