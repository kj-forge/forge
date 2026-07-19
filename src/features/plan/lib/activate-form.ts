import dayjs from "dayjs";
import { z } from "zod";

// Weekday assignments (unit → days) live outside RHF as chip state; the form
// itself carries only the dates. `weeks` is a form-level convenience — the DB
// stores endDate only.
export const activateFormSchema = z.object({
  startDate: z.string().min(1, "Wybierz datę startu."),
  weeks: z.number().int().min(1, "Minimum 1 tydzień.").max(52, "Maksymalnie 52 tygodnie.").optional(),
});

export type ActivateFormValues = z.infer<typeof activateFormSchema>;

// Inclusive end of an N-week run: start + N*7 − 1 days, so 1 week starting
// Monday ends Sunday. Null = open-ended plan.
export function activationEndDate(startIso: string, weeks: number | undefined): string | null {
  if (!weeks) return null;
  return dayjs(startIso)
    .add(weeks * 7 - 1, "day")
    .format("YYYY-MM-DD");
}
