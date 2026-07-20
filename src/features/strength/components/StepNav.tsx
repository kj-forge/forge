import { ChevronLeft, ChevronRight } from "lucide-react";

import type { Step } from "@/features/strength/types";

function stepLabel(step: Step, index: number): string {
  if (step.kind === "REST") return `Krok ${index + 1}: przerwa`;
  return `Krok ${index + 1}: ${step.movements.map((m) => m.exerciseNamePl).join(" + ")}`;
}

// In-drawer navigation between a session's STEPS, in workout order. Arrows do
// NOT loop — "dalej" means chronology, and past the last step there is no
// next; dots jump straight to any step. Hidden for a single-step session.
export function StepNav({
  steps,
  currentId,
  onNavigate,
}: {
  steps: Step[];
  currentId: string;
  onNavigate: (blockId: string) => void;
}) {
  const index = steps.findIndex((s) => s.id === currentId);
  if (steps.length < 2 || index === -1) return null;

  const prev = index > 0 ? steps[index - 1] : null;
  const next = index < steps.length - 1 ? steps[index + 1] : null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Poprzedni krok"
        disabled={!prev}
        onClick={() => prev && onNavigate(prev.id)}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronLeft className="size-5" />
      </button>

      <div className="flex flex-1 flex-wrap items-center justify-center gap-1.5">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={stepLabel(s, i)}
            aria-current={s.id === currentId ? "true" : undefined}
            onClick={() => onNavigate(s.id)}
            className={`h-1.5 rounded-full transition-all ${
              s.id === currentId
                ? "w-5 bg-primary"
                : s.kind === "REST"
                  ? "w-1.5 bg-muted-foreground/20 hover:bg-muted-foreground/40"
                  : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/60"
            }`}
          />
        ))}
      </div>

      <button
        type="button"
        aria-label="Następny krok"
        disabled={!next}
        onClick={() => next && onNavigate(next.id)}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
