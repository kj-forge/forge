import { infiniteQueryOptions } from "@tanstack/react-query";

import { listCompletedSessions } from "@/features/strength/server/sessions";
import type { SessionType } from "@/features/strength/types";

// One definition, two consumers: the route loader (ensureQueryData → SSR of
// page zero, dehydrated to the client) and the view (useSuspenseInfiniteQuery).
export function historyQueryOptions(typ: SessionType | undefined) {
  return infiniteQueryOptions({
    queryKey: ["history", typ ?? "all"],
    queryFn: ({ pageParam }) => listCompletedSessions({ data: { offset: pageParam, typ } }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
  });
}
