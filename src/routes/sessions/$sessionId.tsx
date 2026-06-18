import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSessionDetails } from "@/features/strength/server/sessions";
import { ActiveSessionView } from "@/features/strength/views/ActiveSessionView";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/sessions/$sessionId")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: ({ params }) => getSessionDetails({ data: { sessionId: params.sessionId } }),
  component: ActiveSessionView,
});
