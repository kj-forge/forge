import { z } from "zod";

import { SET_KINDS } from "../constants";

// The form keeps reps/weight as the RAW input strings and converts to numbers
// only at parse time. A number round-trip (floatValue → RHF → value prop) lets
// react-number-format's controlled resync race with fast typing on iOS and
// resurrect just-deleted digits; with strings the resync is idempotent.
export const setFormSchema = z.object({
  kind: z.enum(SET_KINDS),
  reps: z
    .string()
    .trim()
    .min(1, "Wpisz liczbę powtórzeń.")
    .transform(Number)
    .pipe(z.number().int("Liczba całkowita").min(1, "Min 1 powtórzenie").max(999, "Max 999")),
  weightKg: z
    .string()
    .trim()
    .min(1, "Wpisz ciężar (0 = bodyweight).")
    .transform(Number)
    .pipe(z.number().min(0, "Min 0").max(999, "Max 999 kg")),
  rpe: z.number().int().min(6).max(10).nullable(),
});

export type SetFormInput = z.input<typeof setFormSchema>;
export type SetFormValues = z.output<typeof setFormSchema>;

export function numToInputStr(n: number | undefined): string {
  return n === undefined ? "" : String(n);
}

function parseNum(s: string): number | undefined {
  const n = Number.parseFloat(s);
  return Number.isNaN(n) ? undefined : n;
}

export function stepReps(value: string, delta: number): string {
  const base = parseNum(value) ?? (delta > 0 ? 0 : 1);
  return String(Math.max(1, base + delta));
}

export function stepWeight(value: string, delta: number): string {
  const base = parseNum(value) ?? 0;
  return String(Math.max(0, Math.round((base + delta) * 10) / 10));
}
