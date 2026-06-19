// ============================================================================
// Catch-all route for Better Auth's HTTP endpoints — sign-in/sign-out, magic
// link request + verify, Google OAuth start + callback, get-session, etc.
//
// Every `/api/auth/*` path matches `$.ts` (splat) and forwards the raw Request
// to `auth.handler`, which dispatches internally to the right Better Auth
// endpoint based on the URL.
// ============================================================================

import { createFileRoute } from "@tanstack/react-router";

import { auth } from "@/features/auth/server/better-auth";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
