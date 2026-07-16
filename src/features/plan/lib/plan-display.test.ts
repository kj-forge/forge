import { describe, expect, test } from "bun:test";

import { planTrainingLabel } from "./plan-display";

const ex = [{ exerciseId: "a" }];

describe("planTrainingLabel", () => {
  test("written training wins", () => {
    expect(planTrainingLabel({ training: "Long Z2 90 min", hasStrength: true, exercises: ex })).toBe("Long Z2 90 min");
  });

  test("strength day without text shows 'Trening siłowy'", () => {
    expect(planTrainingLabel({ training: "", hasStrength: true, exercises: ex })).toBe("Trening siłowy");
    expect(planTrainingLabel({ training: "   ", hasStrength: true, exercises: ex })).toBe("Trening siłowy");
  });

  test("null when there's neither text nor a strength list", () => {
    expect(planTrainingLabel({ training: "", hasStrength: false, exercises: [] })).toBeNull();
    // strength toggled but no exercises → not a content day
    expect(planTrainingLabel({ training: "", hasStrength: true, exercises: [] })).toBeNull();
  });
});
