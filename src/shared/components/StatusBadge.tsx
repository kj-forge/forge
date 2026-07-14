import { Check } from "lucide-react";

// Small pill badge for session status. Reused on home, history list, and the
// active session header so the visual language stays consistent. Shape + icon
// carry the meaning through color-blind / sun-glare cases.
export function StatusBadge({ endedAt }: { endedAt: Date | null }) {
  const inProgress = endedAt === null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-[10px] text-primary">
      {inProgress ? (
        <>
          <span className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse" />W trakcie
        </>
      ) : (
        <>
          <Check className="size-3" strokeWidth={3} />
          Zakończona
        </>
      )}
    </span>
  );
}
