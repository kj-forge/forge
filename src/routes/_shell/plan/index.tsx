import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSession } from "@/lib/session";

export const Route = createFileRoute("/_shell/plan/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  component: PlanPlaceholder,
});

function PlanPlaceholder() {
  return null;
}
