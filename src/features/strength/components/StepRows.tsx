import { useRouter } from "@tanstack/react-router";
import { ChevronRight, Coffee, Repeat2 } from "lucide-react";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { completedRounds, currentRound, maxLoggedRound } from "@/features/strength/lib/step-progress";
import { removeStep } from "@/features/strength/server/steps";
import type { Step } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

// Session-list row for a superset step: joined names + round progress.
// Mirrors MovementRow's sibling-button layout (card + inline ✕ while empty).
export function SupersetRow({ step, isEnded, onOpen }: { step: Step; isEnded: boolean; onOpen: () => void }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const done = completedRounds(step.movements);
  const touched = maxLoggedRound(step.movements) > 0;
  const canRemoveInline = !isEnded && !touched;

  const handleRemove = async () => {
    setRemoveError(null);
    setRemoving(true);
    try {
      await removeStep({ data: { blockId: step.id } });
      await router.invalidate();
    } catch (err) {
      setRemoveError(getErrorMessage(err, "Nie udało się usunąć kroku."));
      setRemoving(false);
    }
  };

  // Frontier lap (currentRound), not lowest-common — matches the drawer.
  const status =
    step.targetRounds !== null
      ? `${Math.min(currentRound(step.movements), step.targetRounds)}/${step.targetRounds}${done >= step.targetRounds ? " ✓" : ""}`
      : touched
        ? `${done} ${done === 1 ? "obwód zapisany" : done < 5 ? "obwody zapisane" : "obwodów zapisanych"}`
        : "Pusty — tapnij, by zacząć";

  return (
    <>
      <div className="flex items-stretch gap-1">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <Card className="transition-colors hover:bg-accent/50">
            <CardContent className="py-3">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Repeat2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-sm">
                    {step.movements.map((m) => m.exerciseNamePl).join(" + ")}
                  </p>
                  <p className="text-muted-foreground text-xs">Obwód {status}</p>
                </div>
                {step.targetRounds !== null && (
                  <span className="flex shrink-0 items-center gap-1">
                    {Array.from({ length: step.targetRounds }, (_, i) => (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-order dots
                        key={i}
                        className={`size-1.5 rounded-full ${i < done ? "bg-primary" : "bg-muted-foreground/25"}`}
                      />
                    ))}
                  </span>
                )}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </button>

        {canRemoveInline && (
          <button
            type="button"
            className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            onClick={handleRemove}
            disabled={removing}
            aria-label="Usuń krok"
          >
            {removing ? <Spinner size="sm" /> : "✕"}
          </button>
        )}
      </div>

      {removeError && (
        <p className="mt-1 px-1 text-destructive text-xs" role="alert">
          {removeError}
        </p>
      )}
    </>
  );
}

// Informational rest step — dimmed, tappable for its note.
export function RestStepRow({ step, onOpen }: { step: Step; onOpen: () => void }) {
  const minutes = step.durationSeconds !== null ? Math.round((step.durationSeconds / 60) * 10) / 10 : null;
  return (
    <button type="button" className="w-full text-left" onClick={onOpen}>
      <Card className="border-dashed bg-transparent transition-colors hover:bg-accent/50">
        <CardContent className="py-2.5">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
              <Coffee className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">Przerwa{minutes !== null ? ` · ${minutes} min` : ""}</p>
              {step.notes && <p className="truncate text-xs">{step.notes}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
