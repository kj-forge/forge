import { z } from "zod";

import { PICKABLE_SESSION_TYPES } from "@/features/strength/constants";
import { UNIT_INTENSITIES } from "../constants";

// Structural only — the "training required?" rule depends on the exercise
// count, which lives as local drawer state outside RHF, so it's a pure helper
// enforced by the drawer and mirrored on the server.
export const unitFormSchema = z.object({
  name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120, "Maksymalnie 120 znaków."),
  sessionType: z.enum(PICKABLE_SESSION_TYPES),
  intensity: z.enum(UNIT_INTENSITIES),
  training: z.string().trim().max(2000, "Maksymalnie 2000 znaków."),
  goal: z.string().trim().max(500, "Maksymalnie 500 znaków."),
});

export type UnitFormValues = z.infer<typeof unitFormSchema>;

// A unit needs written training UNLESS it's a STRENGTH unit that already
// carries an exercise list (the ordered list is the content). Pure so the
// drawer and the server enforce the same rule.
export function unitTrainingRequired(sessionType: string, exerciseCount: number): boolean {
  return !(sessionType === "STRENGTH" && exerciseCount > 0);
}
