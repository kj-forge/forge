import type { z } from "zod";

// Shared input validator for server functions. On invalid input it throws a
// single user-facing Polish message instead of letting Zod's raw issue dump
// (ZodError.message is a JSON array in v4) leak across the server→client
// boundary into the UI. Field-level guidance lives in the client forms, which
// share the same schemas; this is the server-side backstop for tampering and
// client/server schema drift.
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error("Nieprawidłowe dane. Odśwież stronę i spróbuj ponownie.");
  }
  return result.data;
}
