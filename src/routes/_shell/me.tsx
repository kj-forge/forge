import { createFileRoute, redirect } from "@tanstack/react-router";

import { MeView } from "@/features/auth/views/MeView";
import { listGoals } from "@/features/goals/server/goals";
import { listAllExercises } from "@/features/strength/server/exercises";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

export const Route = createFileRoute("/_shell/me")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  loader: async () => {
    const [goals, exercises] = await Promise.all([listGoals(), listAllExercises()]);
    return { goals, exercises };
  },
  pendingComponent: SessionListSkeleton,
  component: MeView,
});
