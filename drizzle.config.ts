import { defineConfig } from "drizzle-kit";

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
