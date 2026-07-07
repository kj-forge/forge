import { describe, expect, test } from "bun:test";

import { seedSetFields } from "./seed-set-fields";

describe("seedSetFields", () => {
  test("today's set of the kind wins over history", () => {
    const sets = [{ kind: "TOP_SET", reps: 5, weightKg: 132.5 }];
    const lastByKind = { TOP_SET: { reps: 3, weightKg: 130 } };
    expect(seedSetFields(sets, lastByKind, "TOP_SET")).toEqual({ reps: 5, weightKg: 132.5 });
  });

  test("multiple sets of the kind → the latest one", () => {
    const sets = [
      { kind: "WARMUP", reps: 10, weightKg: 60 },
      { kind: "WARMUP", reps: 8, weightKg: 80 },
    ];
    expect(seedSetFields(sets, {}, "WARMUP")).toEqual({ reps: 8, weightKg: 80 });
  });

  test("no set of the kind today → falls back to history", () => {
    const sets = [{ kind: "WARMUP", reps: 10, weightKg: 60 }];
    const lastByKind = { TOP_SET: { reps: 3, weightKg: 130 } };
    expect(seedSetFields(sets, lastByKind, "TOP_SET")).toEqual({ reps: 3, weightKg: 130 });
  });

  test("no session set and no history → undefined", () => {
    expect(seedSetFields([], {}, "BACK_OFF")).toBeUndefined();
  });

  test("bodyweight session set: null weight → 0", () => {
    const sets = [{ kind: "WARMUP", reps: 12, weightKg: null }];
    expect(seedSetFields(sets, {}, "WARMUP")).toEqual({ reps: 12, weightKg: 0 });
  });

  test("bodyweight history ref: null weight → 0, null reps → undefined", () => {
    const lastByKind = { WARMUP: { reps: null, weightKg: null } };
    expect(seedSetFields([], lastByKind, "WARMUP")).toEqual({ reps: undefined, weightKg: 0 });
  });

  test("sets of other kinds don't match", () => {
    const sets = [{ kind: "TOP_SET", reps: 5, weightKg: 132.5 }];
    expect(seedSetFields(sets, {}, "BACK_OFF")).toBeUndefined();
  });
});
