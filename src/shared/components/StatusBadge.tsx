import { Check } from "lucide-react";

// Small pill badge for session status. Reused on home, history list, and the
// active session header so the visual language stays consistent. Shape + icon
// carry the meaning through color-blind / sun-glare cases.
export function StatusBadge({ endedAt }: { endedAt: Date | null }) {
  // Live = ember with a pinging dot; finished = quiet neutral. The two must
  // read differently at a glance, not just by label.
  if (endedAt === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-[10px] text-primary">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        W trakcie
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-semibold text-[10px] text-muted-foreground">
      <Check className="size-3" strokeWidth={3} />
      Zakończona
    </span>
  );
}
