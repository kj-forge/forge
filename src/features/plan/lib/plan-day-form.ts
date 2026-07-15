import { z } from "zod";

import { PLAN_INTENSITIES } from "../constants";

// goal stays a plain string in the form (empty = none) — RHF controlled
// inputs dislike undefined; the submit path converts "" to undefined.
export const planDayFormSchema = z
  .object({
    intensity: z.enum(PLAN_INTENSITIES),
    training: z.string().trim().max(2000, "Maksymalnie 2000 znaków."),
    goal: z.string().trim().max(500, "Maksymalnie 500 znaków."),
  })
  // A Rest day is a free day — it may carry no training text at all. Every
  // other intensity still needs something written down.
  .superRefine((val, ctx) => {
    if (val.intensity !== "RESET" && val.training.length === 0) {
      ctx.addIssue({ code: "custom", path: ["training"], message: "Wpisz trening — choćby „Wolne”." });
    }
  });

export type PlanDayFormValues = z.infer<typeof planDayFormSchema>;
