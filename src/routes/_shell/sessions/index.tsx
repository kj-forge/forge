import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { SESSION_TYPES } from "@/features/strength/constants";
import { listCompletedSessions } from "@/features/strength/server/sessions";
import { SessionsListView } from "@/features/strength/views/SessionsListView";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

// typ = client-side type filter; absent means "all".
const searchSchema = z.object({
  typ: z.enum(SESSION_TYPES).optional(),
});

export const Route = createFileRoute("/_shell/sessions/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  validateSearch: searchSchema,
  loader: () => listCompletedSessions(),
  pendingComponent: SessionListSkeleton,
  component: SessionsListView,
});
