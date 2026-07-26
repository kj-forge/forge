import { describe, expect, test } from "bun:test";

import { sessionDurationMin } from "./session-duration";

const T = (iso: string) => new Date(iso);

describe("sessionDurationMin", () => {
  test("strength: first set to end (session opened early)", () => {
    expect(
      sessionDurationMin({
        type: "STRENGTH",
        startedAt: T("2026-07-25T10:00:00Z"),
        endedAt: T("2026-07-25T11:30:00Z"),
        firstSetAt: T("2026-07-25T10:26:00Z"),
        segmentsMs: 0,
      }),
    ).toBe(64);
  });

  test("strength: no sets falls back to startedAt", () => {
    expect(
      sessionDurationMin({
        type: "STRENGTH",
        startedAt: T("2026-07-25T10:00:00Z"),
        endedAt: T("2026-07-25T11:00:00Z"),
        firstSetAt: null,
        segmentsMs: 0,
      }),
    ).toBe(60);
  });

  test("hyrox: segments sum wins", () => {
    expect(
      sessionDurationMin({
        type: "HYROX",
        startedAt: T("2026-07-25T10:00:00Z"),
        endedAt: T("2026-07-25T11:00:00Z"),
        firstSetAt: null,
        segmentsMs: 42 * 60_000,
      }),
    ).toBe(42);
  });

  test("not ended → null", () => {
    expect(
      sessionDurationMin({ type: "STRENGTH", startedAt: null, endedAt: null, firstSetAt: null, segmentsMs: 0 }),
    ).toBe(null);
  });

  test("ended but no startedAt or firstSetAt to measure from → null", () => {
    expect(
      sessionDurationMin({
        type: "STRENGTH",
        startedAt: null,
        endedAt: T("2026-07-25T11:00:00Z"),
        firstSetAt: null,
        segmentsMs: 0,
      }),
    ).toBe(null);
  });

  test("hyrox without segments and without startedAt has no duration", () => {
    expect(
      sessionDurationMin({
        type: "HYROX",
        startedAt: null,
        endedAt: T("2026-07-25T11:00:00Z"),
        firstSetAt: null,
        segmentsMs: 0,
      }),
    ).toBe(null);
  });
});
