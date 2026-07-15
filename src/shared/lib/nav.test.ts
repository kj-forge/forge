import { describe, expect, test } from "bun:test";

import { isActivePath, NAV_ITEMS, SIDEBAR_ITEMS, showsTabBar, TAB_BAR_ITEMS } from "./nav";

describe("showsTabBar", () => {
  test("visible on the top-level destinations", () => {
    expect(showsTabBar("/")).toBe(true);
    expect(showsTabBar("/sessions")).toBe(true);
    expect(showsTabBar("/sessions/")).toBe(true);
    expect(showsTabBar("/sessions/new")).toBe(true);
    expect(showsTabBar("/stats")).toBe(true);
    expect(showsTabBar("/plan")).toBe(true);
    expect(showsTabBar("/goals")).toBe(true);
    expect(showsTabBar("/me")).toBe(true);
  });

  test("hidden inside a session detail", () => {
    expect(showsTabBar("/sessions/123e4567-e89b-12d3-a456-426614174000")).toBe(false);
    expect(showsTabBar("/stats/abc")).toBe(false);
    expect(showsTabBar("/plan/x")).toBe(false);
  });

  test("hidden on unknown routes (fail closed)", () => {
    expect(showsTabBar("/login")).toBe(false);
  });
});

describe("isActivePath", () => {
  test("exact match, trailing slash tolerated", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/sessions", "/sessions")).toBe(true);
    expect(isActivePath("/sessions/", "/sessions")).toBe(true);
  });

  test("no prefix matching by default — detail routes don't activate parents", () => {
    expect(isActivePath("/sessions/abc", "/sessions")).toBe(false);
    expect(isActivePath("/sessions/new", "/sessions")).toBe(false);
    expect(isActivePath("/sessions", "/")).toBe(false);
  });

  test("non-exact items match their subtree (stats detail keeps the link active)", () => {
    expect(isActivePath("/stats/back-squat", "/stats", false)).toBe(true);
    expect(isActivePath("/stats", "/stats", false)).toBe(true);
    expect(isActivePath("/statsy", "/stats", false)).toBe(false);
  });

  test("statystyki is the only non-exact item", () => {
    expect(NAV_ITEMS.filter((i) => !i.exact).map((i) => i.to)).toEqual(["/stats"]);
  });
});

describe("NAV_ITEMS", () => {
  test("cele replace profil — account lives under the avatar", () => {
    expect(NAV_ITEMS.map((i) => i.to)).toEqual(["/", "/sessions", "/sessions/new", "/stats", "/plan", "/goals"]);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Dziennik", "Historia", "Nowa", "Statystyki", "Plan", "Cele"]);
  });
});

describe("TAB_BAR_ITEMS", () => {
  test("five tabs with cele instead of profil", () => {
    expect(TAB_BAR_ITEMS.map((i) => i.to)).toEqual(["/", "/sessions", "/sessions/new", "/stats", "/goals"]);
  });
});

describe("SIDEBAR_ITEMS", () => {
  test("no profil (avatar) and no nowa (CTA button)", () => {
    expect(SIDEBAR_ITEMS.map((i) => i.to)).toEqual(["/", "/sessions", "/stats", "/plan", "/goals"]);
  });
});
