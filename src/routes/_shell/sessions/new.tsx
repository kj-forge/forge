import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { getStartableUnits } from "@/features/plan/server/plan";
import { SESSION_TYPES } from "@/features/strength/constants";
import { NewSessionView } from "@/features/strength/views/NewSessionView";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

const searchSchema = z.object({
  type: z.enum(SESSION_TYPES).default("STRENGTH"),
});

export const Route = createFileRoute("/_shell/sessions/new")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  validateSearch: searchSchema,
  // Startable STRENGTH units of active plans drive the suggestion; the view
  // defaults to the unit assigned to today (resolved schedule, overrides in).
  loader: () => getStartableUnits(),
  pendingComponent: SessionListSkeleton,
  component: NewSessionView,
});
