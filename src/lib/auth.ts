// ============================================================================
// Forge — Better Auth server instance
// ============================================================================
// Configures Better Auth (v1.6.x):
//   - Drizzle adapter with explicit schema mapping (our auth tables are
//     prefixed `auth_*` so the adapter would not find them by default name)
//   - UUID primary keys minted by Postgres (`gen_random_uuid()`), not by
//     Better Auth — `advanced.database.generateId: false` is the toggle
//   - Magic-link sign-in (email-only, no password); delivery via Resend
//   - Google OAuth (sign-in only; no incremental scopes)
//   - tanstackStartCookies() MUST be the last plugin — it overrides cookie
//     emission to use TanStack Start's response handling
//
// See ADR-0015 for the rationale on each decision, and
// docs/learning/auth-concepts.md for a concept-level walkthrough.
// ============================================================================

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { Resend } from "resend";

import { db } from "../../db/client";
import { authAccounts, authSessions, authVerifications, users } from "../../db/schema";

import { runSignupTransaction } from "./auth-signup";
import { env } from "./env";

const resend = new Resend(env.RESEND_API_KEY);

export const auth = betterAuth({
  baseURL: env.VITE_APP_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, {
    provider: "pg",
    // Map Better Auth's default singular model names → our actual Drizzle tables.
    // Without this mapping, the adapter looks for `user`, `session`, `account`,
    // `verification` — none of which exist in our schema.
    schema: {
      user: users,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
    },
  }),

  advanced: {
    database: {
      // Let Postgres mint UUIDs via gen_random_uuid() (our PK default).
      // If false isn't set, Better Auth inserts a cuid2 string into a uuid
      // column and Postgres rejects with `invalid input syntax for uuid`.
      generateId: false,
    },
  },

  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },

  plugins: [
    magicLink({
      // Better Auth gives us the ready-to-click `url`. We just deliver it.
      // Token expiry is 5 minutes by default — fine for magic links.
      sendMagicLink: async ({ email, url }) => {
        await resend.emails.send({
          from: env.RESEND_FROM_EMAIL,
          to: email,
          subject: "Zaloguj się do Forge",
          html: `
            <p>Cześć!</p>
            <p>Kliknij poniższy link, aby zalogować się do Forge:</p>
            <p><a href="${url}">Zaloguj do Forge</a></p>
            <p>Link wygasa po 5 minutach. Jeśli to nie Ty prosiłeś o logowanie — zignoruj tę wiadomość.</p>
          `,
        });
      },
    }),
    // tanstackStartCookies MUST be last — it wraps cookie-setting endpoints to
    // emit Set-Cookie headers via TanStack Start's response pipeline. Putting
    // anything after it can shadow the cookie behavior.
    tanstackStartCookies(),
  ],

  databaseHooks: {
    user: {
      create: {
        // Atomic side-effects on signup: create the athlete row, public
        // profile row, and audit log entry in a single Postgres transaction
        // via the WebSocket pool. See src/lib/auth-signup.ts.
        after: async (user, ctx) => {
          await runSignupTransaction({
            userId: user.id,
            audit: {
              ip: extractIp(ctx?.headers),
              userAgent: ctx?.headers?.get("user-agent") ?? undefined,
            },
          });
        },
      },
    },
  },
});

// Cloudflare puts the client IP in `cf-connecting-ip`; standard proxy chains
// use `x-forwarded-for` (first entry is the originator). Local dev has neither.
function extractIp(headers: Headers | null | undefined): string | undefined {
  if (!headers) return undefined;
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim();
  return undefined;
}

export type Auth = typeof auth;
export type Session = Auth["$Infer"]["Session"];
