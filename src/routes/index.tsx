import { createFileRoute, redirect } from "@tanstack/react-router";

import { listRecentSessions } from "@/features/strength/server/sessions";
import { HomeView } from "@/features/strength/views/HomeView";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  loader: () => listRecentSessions(),
  component: HomeView,
});
