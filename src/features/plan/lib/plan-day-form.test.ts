import { describe, expect, test } from "bun:test";

import { planDayFormSchema, trainingRequired } from "./plan-day-form";

describe("planDayFormSchema", () => {
  test("accepts empty training (the required rule lives in trainingRequired)", () => {
    expect(planDayFormSchema.safeParse({ intensity: "HARD", training: "", goal: "" }).success).toBe(true);
  });

  test("rejects over-long training", () => {
    expect(planDayFormSchema.safeParse({ intensity: "HARD", training: "x".repeat(2001), goal: "" }).success).toBe(
      false,
    );
  });
});

describe("trainingRequired", () => {
  test("a normal day needs training", () => {
    expect(trainingRequired("HARD", false, 0)).toBe(true);
    expect(trainingRequired("EASY", false, 0)).toBe(true);
  });

  test("a Rest day never needs training", () => {
    expect(trainingRequired("RESET", false, 0)).toBe(false);
  });

  test("a strength day WITH exercises doesn't need written training", () => {
    expect(trainingRequired("EASY", true, 3)).toBe(false);
  });

  test("strength toggled on but no exercises yet still needs training", () => {
    expect(trainingRequired("EASY", true, 0)).toBe(true);
  });
});
