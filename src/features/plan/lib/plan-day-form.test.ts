import { describe, expect, test } from "bun:test";

import { planDayFormSchema } from "./plan-day-form";

const base = { intensity: "HARD" as const, training: "", goal: "" };

describe("planDayFormSchema", () => {
  test("training is required for a normal day", () => {
    const result = planDayFormSchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  test("a REST day may have an empty training (free day)", () => {
    const result = planDayFormSchema.safeParse({ ...base, intensity: "RESET" });
    expect(result.success).toBe(true);
  });

  test("a filled training passes regardless of intensity", () => {
    expect(planDayFormSchema.safeParse({ ...base, training: "Long Z2 90 min" }).success).toBe(true);
  });
});
