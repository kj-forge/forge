import { z } from "zod";

import { DAY_SLOTS } from "@/features/plan/constants";
import { PICKABLE_SESSION_TYPES } from "@/features/strength/constants";

export const adhocFormSchema = z.object({
  sessionType: z.enum(PICKABLE_SESSION_TYPES),
  name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120, "Maksymalnie 120 znaków."),
  note: z.string().trim().max(500, "Maksymalnie 500 znaków."),
  slot: z.enum(DAY_SLOTS),
});

export type AdhocFormValues = z.infer<typeof adhocFormSchema>;
