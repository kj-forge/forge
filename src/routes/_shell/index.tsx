import { createFileRoute, redirect } from "@tanstack/react-router";

import { listRecentSessions } from "@/features/strength/server/sessions";
import { HomeView } from "@/features/strength/views/HomeView";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

export const Route = createFileRoute("/_shell/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  loader: () => listRecentSessions(),
  pendingComponent: SessionListSkeleton,
  component: HomeView,
});
