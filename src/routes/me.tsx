import { createFileRoute, redirect } from "@tanstack/react-router";

import { MeView } from "@/features/auth/views/MeView";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/me")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: MeView,
});
