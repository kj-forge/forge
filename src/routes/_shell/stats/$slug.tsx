import { createFileRoute, redirect } from "@tanstack/react-router";

import { getExerciseStats } from "@/features/strength/server/stats";
import { ExerciseStatsView } from "@/features/strength/views/ExerciseStatsView";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

export const Route = createFileRoute("/_shell/stats/$slug")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: ({ params }) => getExerciseStats({ data: { slug: params.slug } }),
  pendingComponent: SessionListSkeleton,
  component: ExerciseStatsView,
});
