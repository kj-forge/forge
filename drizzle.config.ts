import { neonConfig } from "@neondatabase/serverless";
import { defineConfig } from "drizzle-kit";
import ws from "ws";

// drizzle-kit migrate / push / studio use @neondatabase/serverless's
// WebSocket connection (HTTP fetch can't hold the multi-statement transactions
// migrations need). We use the `ws` package rather than Bun's globalThis.WebSocket
// because @neondatabase/serverless passes Node-style options (headers, agents)
// that browser-style WebSocket constructors don't accept — without `ws` the
// driver fails silently with exit code 1.
neonConfig.webSocketConstructor = ws;

// DATABASE_URL is required when drizzle-kit actually runs (generate / migrate /
// push / studio). We don't throw at import time so that static analyzers (knip,
// IDE) can load this config without setting the env var. drizzle-kit will fail
// fast with its own validation error if the URL is missing or invalid.
const databaseUrl = process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
