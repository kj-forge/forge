import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { SESSION_TYPES } from "@/features/strength/constants";
import { historyQueryOptions } from "@/features/strength/lib/history-query";
import { SessionsListView } from "@/features/strength/views/SessionsListView";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";

// typ = client-side type filter; absent means "all".
const searchSchema = z.object({
  typ: z.enum(SESSION_TYPES).optional(),
});

export const Route = createFileRoute("/_shell/sessions/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  validateSearch: searchSchema,
  // The type filter pages server-side — the loader must re-run when it changes.
  loaderDeps: ({ search }) => ({ typ: search.typ }),
  // Page zero through the query cache: SSR'd here, dehydrated to the client,
  // then useSuspenseInfiniteQuery in the view picks it up without a refetch.
  loader: ({ context, deps }) => context.queryClient.ensureInfiniteQueryData(historyQueryOptions(deps.typ)),
  pendingComponent: SessionListSkeleton,
  component: SessionsListView,
});
