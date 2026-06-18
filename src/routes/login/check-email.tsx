import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CheckEmailView } from "@/features/auth/views/CheckEmailView";

const searchSchema = z.object({
  email: z.string().optional(),
});

export const Route = createFileRoute("/login/check-email")({
  validateSearch: searchSchema,
  component: CheckEmailView,
});
