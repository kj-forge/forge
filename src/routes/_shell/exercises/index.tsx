import { createFileRoute, redirect } from "@tanstack/react-router";

import { listManagedExercises } from "@/features/strength/server/exercises";
import { ExercisesView } from "@/features/strength/views/ExercisesView";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

export const Route = createFileRoute("/_shell/exercises/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: () => listManagedExercises(),
  pendingComponent: SessionListSkeleton,
  component: ExercisesView,
});
