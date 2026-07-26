import { useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState } from "react";
import { NumericFormat } from "react-number-format";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { numToInputStr } from "@/features/strength/lib/set-form";
import { removeExerciseFromSession, updateStationTarget } from "@/features/strength/server/movements";
import type { Movement, Step } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

// A station's one target field is whichever of reps/distance is already set;
// for a fresh station (both null) fall back to the exercise's own unit.
function isDistanceTarget(m: Movement): boolean {
  if (m.targetDistanceM !== null) return true;
  if (m.targetReps !== null) return false;
  return m.exerciseDefaultUnit === "DISTANCE";
}

function originalDraft(m: Movement): string {
  return numToInputStr((isDistanceTarget(m) ? m.targetDistanceM : m.targetReps) ?? undefined);
}

// Pre-start only: editing a Hyrox block's stations before it has any logged
// segments. `step` null closes the sheet; conditional body mount below resets
// drafts on every fresh open while leaving an already-open sheet's drafts
// untouched across the router.invalidate() that follows an add/delete (the
// caller re-derives `step` by id every render — never holds a stale one).
export function EditHyroxBlockSheet({
  step,
  onClose,
  onPickExercise,
}: {
  step: Step | null;
  onClose: () => void;
  onPickExercise: () => void;
}) {
  return (
    <Dialog open={step !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {step && <EditHyroxBlockBody step={step} close={onClose} onPickExercise={onPickExercise} />}
      </DialogContent>
    </Dialog>
  );
}

function EditHyroxBlockBody({
  step,
  close,
  onPickExercise,
}: {
  step: Step;
  close: () => void;
  onPickExercise: () => void;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(step.movements.map((m) => [m.id, originalDraft(m)])),
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftFor = (m: Movement) => drafts[m.id] ?? originalDraft(m);
  const patch = (movementId: string, value: string) => setDrafts((prev) => ({ ...prev, [movementId]: value }));

  const handleDelete = async (movementId: string) => {
    setError(null);
    setDeletingId(movementId);
    try {
      await removeExerciseFromSession({ data: { blockMovementId: movementId } });
      await router.invalidate();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć stacji."));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async () => {
    setError(null);
    const dirty = step.movements.filter((m) => draftFor(m) !== originalDraft(m));
    const invalid = dirty.find((m) => {
      const d = draftFor(m);
      return d !== "" && Number(d) < 1;
    });
    if (invalid) {
      setError(`Uzupełnij wartości: ${invalid.exerciseNamePl}.`);
      return;
    }
    setSaving(true);
    let wrote = false;
    try {
      for (const m of dirty) {
        const d = draftFor(m);
        const value = d === "" ? null : Number(d);
        const isDistance = isDistanceTarget(m);
        await updateStationTarget({
          data: {
            blockMovementId: m.id,
            targetReps: isDistance ? null : value,
            targetDistanceM: isDistance ? value : null,
          },
        });
        wrote = true;
      }
      if (wrote) await router.invalidate();
      close();
    } catch (err) {
      if (wrote) await router.invalidate();
      setError(getErrorMessage(err, "Nie udało się zapisać zmian."));
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
      <DialogHeader className="shrink-0">
        <DialogTitle>Edytuj blok</DialogTitle>
        <DialogDescription>{step.movements.map((m) => m.exerciseNamePl).join(" + ")}</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-2">
        {step.movements.map((m) => {
          const isDistance = isDistanceTarget(m);
          const label = isDistance ? "Metry" : "Powtórzenia";
          return (
            <div key={m.id} className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-medium text-sm">{m.exerciseNamePl}</p>
              <div className="w-24 shrink-0">
                <p className="mb-1 text-center text-muted-foreground text-xs">{label}</p>
                <NumericFormat
                  customInput={Input}
                  className="text-center font-bold tabular-nums"
                  inputMode="numeric"
                  decimalScale={0}
                  allowNegative={false}
                  isAllowed={(v) => v.value === "" || Number(v.value) <= 100000}
                  value={draftFor(m)}
                  valueIsNumericString
                  onValueChange={(v) => patch(m.id, v.value)}
                  aria-label={`${label}: ${m.exerciseNamePl}`}
                  disabled={saving || deletingId !== null}
                />
              </div>
              <button
                type="button"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                onClick={() => handleDelete(m.id)}
                disabled={deletingId !== null || saving || step.movements.length === 1}
                aria-label={`Usuń stację: ${m.exerciseNamePl}`}
              >
                {deletingId === m.id ? <Spinner size="sm" /> : <X className="size-4" />}
              </button>
            </div>
          );
        })}

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onPickExercise}
          disabled={saving || deletingId !== null}
        >
          + Stacja
        </Button>
      </div>

      <div className="shrink-0 space-y-2 px-4 pb-4">
        <Button
          type="button"
          className="w-full bg-ember shadow-ember"
          disabled={saving || deletingId !== null}
          onClick={handleSave}
        >
          {saving ? "Zapisuję..." : "Zapisz"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={close}
          disabled={saving || deletingId !== null}
        >
          Anuluj
        </Button>
      </div>
    </div>
  );
}
