import { z } from "zod";

import { GOAL_TYPES } from "../constants";

// Numeric target kept as a string in the form (NumericFormat pattern —
// see set-form.ts); converted on submit. Empty string = no target.
export const goalFormSchema = z.object({
  type: z.enum(GOAL_TYPES),
  title: z.string().trim().min(1, "Podaj tytuł celu.").max(120, "Maksymalnie 120 znaków."),
  targetValue: z.string(),
  targetUnit: z.string().trim().max(10, "Maksymalnie 10 znaków."),
  targetDate: z.string(),
  exerciseId: z.string(),
});

export type GoalFormValues = z.infer<typeof goalFormSchema>;
