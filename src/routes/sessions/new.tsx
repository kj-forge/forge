import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { SESSION_TYPES } from "@/features/strength/constants";
import { listSessionTemplates } from "@/features/strength/server/sessions";
import { NewSessionView } from "@/features/strength/views/NewSessionView";
import { getSession } from "@/lib/session";

const searchSchema = z.object({
  type: z.enum(SESSION_TYPES).default("STRENGTH"),
});

export const Route = createFileRoute("/sessions/new")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ type: search.type }),
  loader: ({ deps }) => listSessionTemplates({ data: { type: deps.type } }),
  component: NewSessionView,
});
