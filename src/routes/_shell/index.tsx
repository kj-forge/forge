import { createFileRoute, redirect } from "@tanstack/react-router";

import { getTrainingPlan } from "@/features/plan/server/plan";
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
  loader: async () => {
    const [sessions, plan] = await Promise.all([listRecentSessions(), getTrainingPlan()]);
    return { sessions, plan };
  },
  pendingComponent: SessionListSkeleton,
  component: HomeView,
});
