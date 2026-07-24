import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSessionDetails } from "@/features/strength/server/sessions";
import { SessionView } from "@/features/strength/views/SessionView";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/_shell/sessions/$sessionId")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: ({ params }) => getSessionDetails({ data: { sessionId: params.sessionId } }),
  component: SessionView,
});
