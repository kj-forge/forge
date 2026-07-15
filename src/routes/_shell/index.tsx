import { createFileRoute, redirect } from "@tanstack/react-router";

import { getDashboard } from "@/features/dashboard/server/dashboard";
import { DashboardView } from "@/features/dashboard/views/DashboardView";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

export const Route = createFileRoute("/_shell/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  loader: () => getDashboard(),
  pendingComponent: SessionListSkeleton,
  component: DashboardView,
});
