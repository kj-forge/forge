import { createFileRoute, redirect } from "@tanstack/react-router";

import { listCompletedSessions } from "@/features/strength/server/sessions";
import { SessionsListView } from "@/features/strength/views/SessionsListView";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

export const Route = createFileRoute("/_shell/sessions/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: () => listCompletedSessions(),
  pendingComponent: SessionListSkeleton,
  component: SessionsListView,
});
