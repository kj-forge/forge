import { z } from "zod";

import { EXERCISE_CATEGORIES, EXERCISE_UNITS } from "../constants";

// Aliases are typed as one comma-separated line (minimal typing, fully
// optional) and parsed on submit.
export const exerciseFormSchema = z.object({
  namePl: z.string().trim().min(1, "Podaj nazwę.").max(80, "Maksymalnie 80 znaków."),
  category: z.enum(EXERCISE_CATEGORIES),
  defaultUnit: z.enum(EXERCISE_UNITS),
  isMainLift: z.boolean(),
  isPrTracked: z.boolean(),
  isLoadedBodyweight: z.boolean(),
  aliasesText: z.string().trim().max(400, "Za długa lista aliasów."),
});

export type ExerciseFormValues = z.infer<typeof exerciseFormSchema>;

/** "siady, przysiady,, BS " → ["siady", "przysiady", "BS"], capped at 10. */
export function parseAliases(text: string): string[] {
  return text
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
    .slice(0, 10);
}
