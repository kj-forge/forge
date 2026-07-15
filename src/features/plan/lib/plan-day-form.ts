import { z } from "zod";

// Structural only — the "training required?" rule spans fields outside RHF
// (hasStrength + the exercise count live as local drawer state), so it's a
// pure helper enforced by the drawer and mirrored on the server.
export const planDayFormSchema = z.object({
  intensity: z.enum(["HARD", "MEDIUM", "EASY", "RESET"]),
  training: z.string().trim().max(2000, "Maksymalnie 2000 znaków."),
  goal: z.string().trim().max(500, "Maksymalnie 500 znaków."),
});

export type PlanDayFormValues = z.infer<typeof planDayFormSchema>;

// A day needs written training UNLESS it's a Rest day, or it already carries a
// strength exercise list (the ordered list is the content). Pure so the drawer
// and the server enforce the same rule.
export function trainingRequired(intensity: string, hasStrength: boolean, exerciseCount: number): boolean {
  if (intensity === "RESET") return false;
  if (hasStrength && exerciseCount > 0) return false;
  return true;
}
