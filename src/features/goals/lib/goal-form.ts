import { z } from "zod";

import { GOAL_TYPES } from "../constants";

// Numeric target kept as a string in the form (NumericFormat pattern —
// see set-form.ts); converted on submit. Empty string = no target.
export const goalFormSchema = z
  .object({
    type: z.enum(GOAL_TYPES),
    title: z.string().trim().max(120, "Maksymalnie 120 znaków."),
    targetValue: z.string(),
    // STRENGTH_RM only: reps the target weight must be lifted for
    // (NumericFormat string pattern, "1" by default).
    targetReps: z.string(),
    targetUnit: z.string().trim().max(10, "Maksymalnie 10 znaków."),
    targetDate: z.string(),
    exerciseId: z.string(),
  })
  .superRefine((v, ctx) => {
    // A strength goal has no title field — the exercise IS the title; every
    // other type still needs one typed in.
    if (v.type === "STRENGTH_RM" && v.exerciseId.length === 0) {
      ctx.addIssue({ code: "custom", path: ["exerciseId"], message: "Wybierz ćwiczenie." });
    }
    if (v.type !== "STRENGTH_RM" && v.title.length === 0) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Podaj tytuł celu." });
    }
  });

export type GoalFormValues = z.infer<typeof goalFormSchema>;
