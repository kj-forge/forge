import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExerciseNav } from "@/features/strength/components/ExerciseNav";
import { SET_KIND_COLOR, SET_KIND_DISPLAY_ORDER, SET_KIND_ICON, SET_KIND_LABEL } from "@/features/strength/constants";
import { formatSet } from "@/features/strength/lib/format-set";
import { removeExerciseFromSession } from "@/features/strength/server/movements";
import type { Movement } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

interface ViewOnlyExerciseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Null while closed — one drawer is rendered at the view level and the open
  // movement is selected by id.
  movement: Movement | null;
  movements: Movement[];
  onNavigate: (id: string) => void;
}

export function ViewOnlyExerciseDrawer({
  open,
  onOpenChange,
  movement,
  movements,
  onNavigate,
}: ViewOnlyExerciseDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && movement ? (
          <ViewOnlyExerciseDrawerBody
            key={movement.id}
            movement={movement}
            movements={movements}
            onNavigate={onNavigate}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ViewOnlyExerciseDrawerBody({
  movement,
  movements,
  onNavigate,
  onClose,
}: {
  movement: Movement;
  movements: Movement[];
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [removingExercise, setRemovingExercise] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group sets by kind, preserving each set's setNumber for stable display.
  const grouped = SET_KIND_DISPLAY_ORDER.map((kind) => ({
    kind,
    sets: movement.sets.filter((s) => s.kind === kind),
  })).filter((g) => g.sets.length > 0);

  // Even an ended session can have an empty (never-logged) movement — let the
  // user clean it up from inside the drawer. Server still guards on
  // COUNT(sets) = 0 so a stale client can't bypass.
  const canRemoveExercise = movement.sets.length === 0;

  const handleRemoveExercise = async () => {
    setError(null);
    setRemovingExercise(true);
    try {
      await removeExerciseFromSession({ data: { blockMovementId: movement.id } });
      await router.invalidate();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć ćwiczenia."));
      setRemovingExercise(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
      <DialogHeader className="shrink-0">
        <DialogTitle>{movement.exerciseNamePl}</DialogTitle>
        <DialogDescription>
          {movement.sets.length === 0
            ? "Brak zalogowanych serii"
            : `${movement.sets.length} ${movement.sets.length === 1 ? "seria" : "serii"} · podsumowanie`}
        </DialogDescription>
      </DialogHeader>

      <div className="shrink-0 px-4 pt-1 pb-2">
        <ExerciseNav movements={movements} currentId={movement.id} onNavigate={onNavigate} />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
        {grouped.length === 0 ? (
          <p className="rounded-lg bg-muted/50 p-3 text-center text-muted-foreground text-sm">
            To ćwiczenie zostało dodane do sesji, ale nie zalogowano żadnej serii.
          </p>
        ) : (
          grouped.map((g) => (
            <section key={g.kind} className="space-y-1.5">
              <h3 className={`font-medium text-xs ${SET_KIND_COLOR[g.kind]}`}>
                {SET_KIND_ICON[g.kind]} {SET_KIND_LABEL[g.kind]}
              </h3>
              <ul className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
                {g.sets.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs">#{s.setNumber}</span>
                    <span className="flex-1 text-center">{formatSet(s)}</span>
                    <span className="w-12 text-right text-muted-foreground text-xs">
                      {s.rpe !== null ? `RPE ${s.rpe}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      <DialogFooter className="shrink-0 gap-2">
        {canRemoveExercise && (
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            disabled={removingExercise}
            onClick={handleRemoveExercise}
          >
            {removingExercise ? <Spinner size="sm" /> : "Usuń ćwiczenie z sesji"}
          </Button>
        )}
        <DialogClose asChild>
          <Button variant="outline" className="w-full">
            Zamknij
          </Button>
        </DialogClose>
      </DialogFooter>
    </div>
  );
}
