import { createFileRoute, redirect } from "@tanstack/react-router";

import { listGoals } from "@/features/goals/server/goals";
import { GoalsView } from "@/features/goals/views/GoalsView";
import { listAllExercises } from "@/features/strength/server/exercises";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

export const Route = createFileRoute("/_shell/goals/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const [goals, exercises] = await Promise.all([listGoals(), listAllExercises()]);
    return { goals, exercises };
  },
  pendingComponent: SessionListSkeleton,
  component: GoalsView,
});
