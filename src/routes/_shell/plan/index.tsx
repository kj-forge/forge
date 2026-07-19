import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { getPlanScreen } from "@/features/plan/server/plan";
import { PlanView } from "@/features/plan/views/PlanView";
import { listAllExercises } from "@/features/strength/server/exercises";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

const searchSchema = z.object({
  tab: z.enum(["harmonogram", "plany"]).default("harmonogram"),
  // Any date within the requested week; the server snaps it to Monday.
  week: z.iso.date().optional(),
});

export const Route = createFileRoute("/_shell/plan/")({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loaderDeps: ({ search }) => ({ week: search.week }),
  loader: async ({ deps }) => {
    // allExercises feeds the unit editor's strength-exercise picker (small
    // catalogue, filtered client-side — no per-keystroke server search).
    const [screen, allExercises] = await Promise.all([
      getPlanScreen({ data: deps.week ? { weekStart: deps.week } : undefined }),
      listAllExercises(),
    ]);
    return { screen, allExercises };
  },
  pendingComponent: SessionListSkeleton,
  component: PlanView,
});
