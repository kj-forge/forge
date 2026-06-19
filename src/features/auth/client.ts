// ============================================================================
// Forge — Better Auth client
// ============================================================================
// Browser-side counterpart to src/lib/auth.ts. Holds NO secrets — only
// type-safe React hooks and methods that hit our `/api/auth/*` endpoints.
//
// Usage in components:
//   import { authClient, signIn, signOut, useSession } from "@/lib/auth-client";
//   const { data: session } = useSession();
//   await signIn.magicLink({ email });
//   await signIn.social({ provider: "google" });
//
// `magicLinkClient()` must mirror the server's `magicLink()` plugin so the
// client knows about the `signIn.magicLink` action. Google OAuth doesn't
// need a plugin — `signIn.social` is built into core.
// ============================================================================

import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Vite inlines VITE_* envs into the client bundle at build time.
  // Same value as server's env.VITE_APP_URL — see src/lib/env.ts.
  baseURL: import.meta.env.VITE_APP_URL,
  plugins: [magicLinkClient()],
});

export const { signIn, signOut, useSession } = authClient;
