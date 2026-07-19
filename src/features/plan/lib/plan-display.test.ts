import { describe, expect, test } from "bun:test";

import { unitTrainingLabel } from "./plan-display";

const ex = [{ exerciseId: "a" }];

describe("unitTrainingLabel", () => {
  test("written training wins", () => {
    expect(unitTrainingLabel({ training: "Long Z2 90 min", sessionType: "STRENGTH", exercises: ex })).toBe(
      "Long Z2 90 min",
    );
  });

  test("strength unit without text shows 'Trening siłowy'", () => {
    expect(unitTrainingLabel({ training: "", sessionType: "STRENGTH", exercises: ex })).toBe("Trening siłowy");
    expect(unitTrainingLabel({ training: "   ", sessionType: "STRENGTH", exercises: ex })).toBe("Trening siłowy");
  });

  test("null when there's neither text nor a strength list", () => {
    expect(unitTrainingLabel({ training: "", sessionType: "RUNNING", exercises: [] })).toBeNull();
    // strength type but no exercises → not a content unit
    expect(unitTrainingLabel({ training: "", sessionType: "STRENGTH", exercises: [] })).toBeNull();
  });
});
