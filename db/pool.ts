// ============================================================================
// Pooled (WebSocket) Drizzle client factory — used ONLY when we need real
// Postgres transactions. `db/client.ts` (HTTP driver) is the default for
// everything else — it's faster and edge-native, but each request is a single
// statement, so it cannot wrap multiple inserts in one atomic transaction.
//
// IMPORTANT — Workers lifecycle constraint:
// On Cloudflare Workers, WebSocket connections cannot outlive a request.
// A module-scope Pool would silently fail on subsequent requests once the
// underlying socket is terminated by the runtime. Instead, callers invoke
// `createPool()` inside their handler, use it, and call `end()` in a finally
// block — fresh WS handshake per atomic flow.
//
// Concrete use cases for this factory today:
//   - Signup hook (auth-signup.runSignupTransaction): athlete + public
//     profile + audit_log must succeed or fail together; partial state is
//     forbidden.
//   - Strength session create (strength.runCreateSession): atomic session +
//     block + movements with correlated subqueries for previous-session
//     carry-over.
//
// WebSocket adds ~50-150 ms of handshake on each createPool() call (no reuse
// across requests on Workers). Acceptable cost for the rare atomicity flows
// — both happen once per user action and only on low-frequency paths.
// ============================================================================

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

// Workers has WebSocket globally; Node/Bun does not (drizzle-kit migrate,
// db:seed, db:studio all run on Bun). Polyfill once if missing.
let webSocketPolyfilled = false;
async function ensureWebSocketConstructor(): Promise<void> {
  if (webSocketPolyfilled) return;
  if (typeof WebSocket === "undefined") {
    const ws = (await import("ws")).default;
    neonConfig.webSocketConstructor = ws;
  }
  webSocketPolyfilled = true;
}

export interface PooledClient {
  db: ReturnType<typeof drizzle<typeof schema>>;
  end: () => Promise<void>;
}

export async function createPool(): Promise<PooledClient> {
  await ensureWebSocketConstructor();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Add it to .env (see .env.example) or your environment.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  return {
    db: drizzle({ client: pool, schema, casing: "snake_case" }),
    end: () => pool.end(),
  };
}
