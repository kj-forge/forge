import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SET_KIND_COLOR, SET_KIND_DISPLAY_ORDER, SET_KIND_LABEL } from "@/features/strength/constants";
import { formatSet } from "@/features/strength/lib/format-set";
import { removeExerciseFromSession } from "@/features/strength/server/movements";
import type { Movement } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

interface ViewOnlyExerciseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movement: Movement;
}

export function ViewOnlyExerciseDrawer({ open, onOpenChange, movement }: ViewOnlyExerciseDrawerProps) {
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
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć ćwiczenia."));
      setRemovingExercise(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>{movement.exerciseNamePl}</DrawerTitle>
            <DrawerDescription>
              {movement.sets.length === 0
                ? "Brak zalogowanych serii"
                : `${movement.sets.length} ${movement.sets.length === 1 ? "seria" : "serii"} · podsumowanie`}
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4 px-4">
            {grouped.length === 0 ? (
              <p className="rounded-lg bg-muted/50 p-3 text-center text-muted-foreground text-sm">
                To ćwiczenie zostało dodane do sesji, ale nie zalogowano żadnej serii.
              </p>
            ) : (
              grouped.map((g) => (
                <section key={g.kind} className="space-y-1.5">
                  <h3 className={`font-medium text-xs ${SET_KIND_COLOR[g.kind]}`}>{SET_KIND_LABEL[g.kind]}</h3>
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

          <DrawerFooter className="gap-2">
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
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">
                Zamknij
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
