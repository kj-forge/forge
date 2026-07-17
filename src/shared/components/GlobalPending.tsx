import { Spinner } from "./Spinner";

// Full-page loader shown by TanStack Router's `defaultPendingComponent`
// whenever a route loader (or navigation transition) takes longer than the
// configured `defaultPendingMs` threshold. Mobile-first, minimalist —
// dimmed backdrop + centered spinner + Polish label.
export function GlobalPending() {
  return (
    // The backdrop dims the whole viewport, but the spinner centers on the
    // content area — padding by the shell insets shifts the midpoint right
    // of the sidebar and below the top nav (vars are 0 on mobile).
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 pt-(--content-inset-top) pl-(--content-inset-left) backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3">
        <Spinner size="md" className="text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Ładuję...</p>
      </div>
    </div>
  );
}
