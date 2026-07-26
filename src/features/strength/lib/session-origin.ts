// Origin rides TanStack Router history state — it belongs to the history
// entry, so it survives router.invalidate() but not a hard refresh (that
// starts a fresh history entry with no state). Every consumer falls back to
// Historia when it's missing.
export type SessionOrigin = "dziennik" | "historia";

export const SESSION_ORIGIN_TARGET = {
  dziennik: { to: "/", label: "Dziennik" },
  historia: { to: "/sessions", label: "Historia" },
} as const;

// Declaration merging (the idiomatic TanStack Router way to type custom
// history state — @tanstack/history ships an empty `HistoryState` interface
// for exactly this) makes `state={{ sessionOrigin }}` on `<Link>` and
// `useLocation().state.sessionOrigin` type-check directly, no cast needed.
declare module "@tanstack/history" {
  interface HistoryState {
    sessionOrigin?: SessionOrigin;
  }
}

export function readSessionOrigin(state: unknown): SessionOrigin {
  const s = (state as { sessionOrigin?: unknown } | null)?.sessionOrigin;
  return s === "dziennik" ? "dziennik" : "historia";
}
