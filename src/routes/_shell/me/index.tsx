import { createFileRoute, redirect } from "@tanstack/react-router";

import { ProfileView } from "@/features/auth/views/ProfileView";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/_shell/me/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: ProfileView,
});
