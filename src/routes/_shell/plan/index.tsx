import { createFileRoute, redirect } from "@tanstack/react-router";

import { getTrainingPlan } from "@/features/plan/server/plan";
import { PlanView } from "@/features/plan/views/PlanView";
import { listAllExercises } from "@/features/strength/server/exercises";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

export const Route = createFileRoute("/_shell/plan/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: async () => {
    // allExercises feeds the day editor's strength-exercise picker (small
    // catalogue, filtered client-side — no per-keystroke server search).
    const [plan, allExercises] = await Promise.all([getTrainingPlan(), listAllExercises()]);
    return { plan, allExercises };
  },
  pendingComponent: SessionListSkeleton,
  component: PlanView,
});
