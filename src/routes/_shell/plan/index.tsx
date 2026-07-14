import { createFileRoute, redirect } from "@tanstack/react-router";

import { getTrainingPlan } from "@/features/plan/server/plan";
import { PlanView } from "@/features/plan/views/PlanView";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

export const Route = createFileRoute("/_shell/plan/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: () => getTrainingPlan(),
  pendingComponent: SessionListSkeleton,
  component: PlanView,
});
