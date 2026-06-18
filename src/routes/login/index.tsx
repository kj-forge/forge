import { createFileRoute, redirect } from "@tanstack/react-router";

import { LoginView } from "@/features/auth/views/LoginView";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/login/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (session) throw redirect({ to: "/" });
  },
  component: LoginView,
});
