import { z } from "zod";

import { PLAN_INTENSITIES } from "../constants";

// goal stays a plain string in the form (empty = none) — RHF controlled
// inputs dislike undefined; the submit path converts "" to undefined.
export const planDayFormSchema = z.object({
  intensity: z.enum(PLAN_INTENSITIES),
  training: z.string().trim().min(1, "Wpisz trening — choćby „Wolne”.").max(2000, "Maksymalnie 2000 znaków."),
  goal: z.string().trim().max(500, "Maksymalnie 500 znaków."),
});

export type PlanDayFormValues = z.infer<typeof planDayFormSchema>;
