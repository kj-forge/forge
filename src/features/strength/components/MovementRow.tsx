import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { SET_KIND_COLOR, SET_KIND_DISPLAY_ORDER } from "@/features/strength/constants";
import { formatSet } from "@/features/strength/lib/format-set";
import { removeExerciseFromSession } from "@/features/strength/server/movements";
import type { Movement } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

import { ExerciseDrawer } from "./ExerciseDrawer";
import { ViewOnlyExerciseDrawer } from "./ViewOnlyExerciseDrawer";

export function MovementRow({ movement, isEnded }: { movement: Movement; isEnded: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const workSets = movement.sets.filter((s) => s.kind !== "WARMUP");

  // Active session + empty movement: show the inline ✕ for quick removal
  // (mid-workout the user may have added an exercise they no longer want).
  // Ended session + empty movement: removal lives inside the view-only drawer.
  const canRemoveInline = !isEnded && movement.sets.length === 0;

  const handleRemove = async () => {
    setRemoveError(null);
    setRemoving(true);
    try {
      await removeExerciseFromSession({ data: { blockMovementId: movement.id } });
      await router.invalidate();
    } catch (err) {
      setRemoveError(getErrorMessage(err, "Nie udało się usunąć ćwiczenia."));
      setRemoving(false);
    }
  };

  const statusText =
    movement.sets.length === 0 ? "Pusta" : `${workSets.length} ${workSets.length === 1 ? "seria" : "serii"}`;
  // Green only once a working set exists — a warmup-only movement still reads
  // "0 serii", but muted, not as if it were logged.
  const statusClass = workSets.length === 0 ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400";

  return (
    <>
      {/* Sibling-button layout: the main card and the delete ✕ are two
          separate <button>s side by side (not nested — that would be
          invalid HTML and would steal the card's tap target). */}
      <div className="flex items-stretch gap-1">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(true)}>
          <Card className="transition-colors hover:bg-accent/50">
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate font-medium text-sm">{movement.exerciseNamePl}</p>
                <span className={`w-20 shrink-0 text-right text-xs ${statusClass}`}>{statusText}</span>
              </div>
              {workSets.length > 0 && (
                <div className="mt-1 space-y-0.5 text-xs">
                  {SET_KIND_DISPLAY_ORDER.filter((kind) => kind !== "WARMUP").map((kind) => {
                    const kindSets = movement.sets.filter((s) => s.kind === kind);
                    if (kindSets.length === 0) return null;
                    return (
                      <p key={kind} className={SET_KIND_COLOR[kind]}>
                        {kindSets.map(formatSet).join(" · ")}
                      </p>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </button>

        {canRemoveInline && (
          <button
            type="button"
            className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            onClick={handleRemove}
            disabled={removing}
            aria-label={`Usuń ćwiczenie ${movement.exerciseNamePl}`}
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

      {isEnded ? (
        <ViewOnlyExerciseDrawer open={open} onOpenChange={setOpen} movement={movement} />
      ) : (
        <ExerciseDrawer open={open} onOpenChange={setOpen} movement={movement} />
      )}
    </>
  );
}
