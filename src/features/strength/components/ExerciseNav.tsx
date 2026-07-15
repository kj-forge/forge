import { ChevronLeft, ChevronRight } from "lucide-react";

import type { Movement } from "@/features/strength/types";

// Compact in-drawer navigation between a session's exercises: arrows loop
// 1→N→1, dots jump straight to any exercise. No counter — the whole point is
// to stay small and let the athlete switch fast mid-session. Hidden for a
// single-exercise session (nothing to move to).
export function ExerciseNav({
  movements,
  currentId,
  onNavigate,
}: {
  movements: Movement[];
  currentId: string;
  onNavigate: (id: string) => void;
}) {
  const index = movements.findIndex((m) => m.id === currentId);
  if (movements.length < 2 || index === -1) return null;

  const n = movements.length;
  const prev = movements[(index - 1 + n) % n];
  const next = movements[(index + 1) % n];

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Poprzednie ćwiczenie"
        onClick={() => onNavigate(prev.id)}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ChevronLeft className="size-5" />
      </button>

      <div className="flex flex-1 flex-wrap items-center justify-center gap-1.5">
        {movements.map((m, i) => (
          <button
            key={m.id}
            type="button"
            aria-label={`Ćwiczenie ${i + 1}: ${m.exerciseNamePl}`}
            aria-current={m.id === currentId ? "true" : undefined}
            onClick={() => onNavigate(m.id)}
            className={`h-1.5 rounded-full transition-all ${m.id === currentId ? "w-5 bg-primary" : "w-1.5 bg-muted hover:bg-muted-foreground/40"}`}
          />
        ))}
      </div>

      <button
        type="button"
        aria-label="Następne ćwiczenie"
        onClick={() => onNavigate(next.id)}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}
