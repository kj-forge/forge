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

  test("no prefix matching — detail routes don't activate parents", () => {
    expect(isActivePath("/sessions/abc", "/sessions")).toBe(false);
    expect(isActivePath("/sessions/new", "/sessions")).toBe(false);
    expect(isActivePath("/sessions", "/")).toBe(false);
  });
});

describe("NAV_ITEMS", () => {
  test("six sidebar entries with plan before profil", () => {
    expect(NAV_ITEMS.map((i) => i.to)).toEqual(["/", "/sessions", "/sessions/new", "/stats", "/plan", "/me"]);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Dziennik", "Historia", "Nowa", "Statystyki", "Plan", "Profil"]);
  });
});

describe("TAB_BAR_ITEMS", () => {
  test("tab bar stays at five — plan is sidebar/home-card only", () => {
    expect(TAB_BAR_ITEMS.map((i) => i.to)).toEqual(["/", "/sessions", "/sessions/new", "/stats", "/me"]);
  });
});

describe("SIDEBAR_ITEMS", () => {
  test("no profil (avatar dropdown) and no nowa (dashboard CTA)", () => {
    expect(SIDEBAR_ITEMS.map((i) => i.to)).toEqual(["/", "/sessions", "/stats", "/plan"]);
  });
});
