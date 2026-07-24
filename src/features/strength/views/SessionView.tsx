import { getRouteApi } from "@tanstack/react-router";

import { ActiveSessionView } from "@/features/strength/views/ActiveSessionView";
import { HyroxSessionView } from "@/features/strength/views/HyroxSessionView";

const route = getRouteApi("/_shell/sessions/$sessionId");

// The only render branch on session.type in the app — a deliberate exception
// recorded in ADR-0023.
export function SessionView() {
  const { session } = route.useLoaderData();
  return session.type === "HYROX" ? <HyroxSessionView /> : <ActiveSessionView />;
}
