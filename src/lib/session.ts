// ============================================================================
// Session helpers — single source for "who is the current user?".
//
// `getSession()` is a server function (runs only on the server, callable from
// route loaders / beforeLoad / components). It forwards the incoming request
// headers to Better Auth so it can look up the session by cookie.
//
// Pattern in routes that require auth:
//   beforeLoad: async () => {
//     const session = await getSession()
//     if (!session) throw redirect({ to: "/login" })
//     return { session }
//   }
// ============================================================================

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { auth } from "@/features/auth/server/better-auth";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  // getRequestHeaders returns a plain object; Better Auth wants a Headers
  // instance (it reads cookies via Headers#get).
  const headers = new Headers(getRequestHeaders() as HeadersInit);
  return auth.api.getSession({ headers });
});

export type SessionPayload = Awaited<ReturnType<typeof getSession>>;
