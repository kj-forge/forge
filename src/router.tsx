import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { GlobalPending } from "@/shared/components/GlobalPending";
import { RouteError } from "@/shared/components/RouteError";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // Per request (getRouter runs per request on the server) — a module-scope
  // client would share its cache between users. The SSR integration below
  // dehydrates server-run queries into the HTML and provides the client.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
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

    // Cross-fade between routes via the View Transitions API — a no-op in
    // browsers without support (and under prefers-reduced-motion, see CSS).
    defaultViewTransition: true,
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}
