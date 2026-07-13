import { describe, expect, test } from "bun:test";

import { numToInputStr, setFormSchema, stepReps, stepWeight } from "./set-form";

const valid = { kind: "TOP_SET", reps: "5", weightKg: "132.5", rpe: null };

describe("setFormSchema", () => {
  test("parses numeric strings into numbers", () => {
    const result = setFormSchema.parse(valid);
    expect(result.reps).toBe(5);
    expect(result.weightKg).toBe(132.5);
  });

  test("empty reps → required message", () => {
    const result = setFormSchema.safeParse({ ...valid, reps: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Wpisz liczbę powtórzeń.");
  });

  test("empty weight → required message", () => {
    const result = setFormSchema.safeParse({ ...valid, weightKg: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Wpisz ciężar (0 = bodyweight).");
  });

  test("weight 0 (bodyweight) is valid", () => {
    expect(setFormSchema.parse({ ...valid, weightKg: "0" }).weightKg).toBe(0);
  });

  test("reps 0 → min message", () => {
    const result = setFormSchema.safeParse({ ...valid, reps: "0" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Min 1 powtórzenie");
  });

  test("fractional reps → integer message", () => {
    const result = setFormSchema.safeParse({ ...valid, reps: "10.5" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Liczba całkowita");
  });

  test("weight above 999 → max message", () => {
    const result = setFormSchema.safeParse({ ...valid, weightKg: "1000" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Max 999 kg");
  });

  test("rpe accepts 6-10 and null", () => {
    expect(setFormSchema.parse({ ...valid, rpe: 8 }).rpe).toBe(8);
    expect(setFormSchema.parse({ ...valid, rpe: null }).rpe).toBeNull();
  });
});

describe("stepReps", () => {
  test("increments and decrements", () => {
    expect(stepReps("10", 1)).toBe("11");
    expect(stepReps("10", -1)).toBe("9");
  });

  test("clamps at 1", () => {
    expect(stepReps("1", -1)).toBe("1");
  });

  test("empty input → 1 in both directions", () => {
    expect(stepReps("", 1)).toBe("1");
    expect(stepReps("", -1)).toBe("1");
  });
});

describe("stepWeight", () => {
  test("steps by 2.5", () => {
    expect(stepWeight("60", -2.5)).toBe("57.5");
    expect(stepWeight("60", 2.5)).toBe("62.5");
  });

  test("clamps at 0", () => {
    expect(stepWeight("0", -2.5)).toBe("0");
    expect(stepWeight("1.25", -2.5)).toBe("0");
  });

  test("empty input steps from 0", () => {
    expect(stepWeight("", 2.5)).toBe("2.5");
    expect(stepWeight("", -2.5)).toBe("0");
  });

  test("no floating point artifacts", () => {
    expect(stepWeight("62.5", 2.5)).toBe("65");
    expect(stepWeight("57.15", 2.5)).toBe("59.7");
  });
});

describe("numToInputStr", () => {
  test("number → string, undefined → empty", () => {
    expect(numToInputStr(5)).toBe("5");
    expect(numToInputStr(132.5)).toBe("132.5");
    expect(numToInputStr(0)).toBe("0");
    expect(numToInputStr(undefined)).toBe("");
  });
});
