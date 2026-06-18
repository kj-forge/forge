import { createRouter } from "@tanstack/react-router";

import { GlobalPending } from "@/shared/components/GlobalPending";
import { RouteError } from "@/shared/components/RouteError";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,

    // Loading state for slow route transitions / loaders.
    // - defaultPendingMs: only show the loader if the transition takes longer
    //   than 300ms (prevents flicker on fast operations).
    // - defaultPendingMinMs: once shown, keep it visible for at least 300ms
    //   (prevents a brief flash if the transition completes right after the
    //   loader appears).
    defaultPendingMs: 300,
    defaultPendingMinMs: 300,
    defaultPendingComponent: GlobalPending,
    defaultErrorComponent: RouteError,
  });

  return router;
}
