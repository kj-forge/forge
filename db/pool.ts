// ============================================================================
// Pooled (WebSocket) Drizzle client — used ONLY when we need real Postgres
// transactions. `db/client.ts` (HTTP driver) is the default for everything
// else — it's faster and Workers-native, but each request is a single
// statement, so it cannot wrap multiple inserts in one atomic transaction.
//
// Concrete use cases for this pool today:
//   - Signup hook (auth-signup.runSignupTransaction): athlete + public profile
//     + audit_log must succeed or fail together; partial state is forbidden.
//   - Any future flow that needs multi-row atomicity (data export, account
//     deletion cascade, role transitions).
//
// WebSocket adds ~50 ms of handshake on first use per process; subsequent
// calls re-use the pool. Trivial cost for the rare flows that need it.
// ============================================================================

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

// Same polyfill story as drizzle.config.ts: @neondatabase/serverless's Pool
// needs a Node-style WebSocket constructor; Bun's globalThis.WebSocket has a
// different API and the driver fails silently against it.
neonConfig.webSocketConstructor = ws;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Add it to .env (see .env.example) or your environment.");
}

const pool = new Pool({ connectionString: databaseUrl });

export const dbPool = drizzle({ client: pool, schema, casing: "snake_case" });
export type DbPool = typeof dbPool;
