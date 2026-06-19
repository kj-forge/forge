import { createFileRoute, redirect } from "@tanstack/react-router";

import { listCompletedSessions } from "@/features/strength/server/sessions";
import { SessionsListView } from "@/features/strength/views/SessionsListView";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/sessions/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: () => listCompletedSessions(),
  component: SessionsListView,
});
