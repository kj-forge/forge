// ============================================================================
// Forge — runtime environment validation
// ============================================================================
// Parses process.env at module load. Throws a single, actionable error if any
// required variable is missing or malformed — instead of crashing later in
// runtime with cryptic provider errors.
//
// Add new variables here AND in .env.example simultaneously (they're a
// contract — keep them in sync).
// ============================================================================

import { z } from "zod";

const envSchema = z.object({
  // ── Database ─────────────────────────────────────────────────────────────
  DATABASE_URL: z.url("DATABASE_URL must be a valid postgres:// URL"),

  // ── Better Auth ──────────────────────────────────────────────────────────
  // Length: 32 chars covers `openssl rand -base64 32` output (44 chars) and
  // any reasonable hand-rolled secret. Shorter = weak HMAC, refuse to boot.
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be 32+ chars (use `openssl rand -base64 32`)"),
  // VITE_-prefixed because the client also needs this value (auth-client baseURL).
  // Vite inlines VITE_* into the client bundle; server reads the same key from
  // process.env. One env, two namespaces.
  VITE_APP_URL: z.url("VITE_APP_URL must be a valid URL (dev: http://localhost:3000)"),

  // ── Resend ───────────────────────────────────────────────────────────────
  // Resend API keys always start with `re_`. Wrong prefix = wrong service /
  // typo / accidentally pasted something else.
  RESEND_API_KEY: z.string().startsWith("re_", "RESEND_API_KEY must start with 're_'"),
  RESEND_FROM_EMAIL: z.email("RESEND_FROM_EMAIL must be a valid email address"),

  // ── Google OAuth ─────────────────────────────────────────────────────────
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment variables — copy .env.example to .env and fill in real values:\n${issues}`);
}

export const env = parsed.data;
