// Module-level on purpose: a ternary inside a component's try/catch is a
// React Compiler bail-out ("value blocks within a try/catch statement");
// a plain function call there is not.
export function getErrorMessage(err: unknown, fallback: string): string {
  // Network failures arrive as TypeError ("Failed to fetch" / "Load failed") —
  // raw browser text, useless in a Polish UI. Show the fallback instead.
  if (err instanceof TypeError) return fallback;
  if (!(err instanceof Error)) return fallback;
  // Backstop: a leaked serialized error (e.g. a Zod issue array/object that
  // slipped past parseInput) is not user-facing text — fall back instead of
  // dumping JSON into the UI.
  const message = err.message.trim();
  if (message.startsWith("[") || message.startsWith("{")) return fallback;
  return message || fallback;
}
