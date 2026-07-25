import { describe, expect, test } from "bun:test";

import { draftDirty, draftToPayload, toDraft } from "./set-draft";

const set = { reps: 5, weightKg: 100, durationSeconds: null, rpe: 9 };

describe("set drafts", () => {
  test("toDraft round-trips numbers to input strings", () => {
    expect(toDraft(set as never)).toEqual({ reps: "5", weightKg: "100", durationSeconds: "", rpe: "9" });
  });

  test("draftDirty detects any field change and ignores none", () => {
    const d = toDraft(set as never);
    expect(draftDirty(set as never, d)).toBe(false);
    expect(draftDirty(set as never, { ...d, weightKg: "102.5" })).toBe(true);
  });

  test("draftToPayload full-replaces with nulls; weight <= 0 becomes bodyweight", () => {
    expect(draftToPayload("id1", { reps: "8", weightKg: "0", durationSeconds: "", rpe: "" })).toEqual({
      setId: "id1",
      reps: 8,
      weightKg: null,
      durationSeconds: null,
      rpe: null,
    });
  });
});
