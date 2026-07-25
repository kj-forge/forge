import { useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState } from "react";
import { NumericFormat } from "react-number-format";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { draftDirty, draftToPayload, type RowDraft, toDraft } from "@/features/strength/lib/set-draft";
import { loggedRoundNumbers } from "@/features/strength/lib/step-progress";
import { deleteSet, updateSet } from "@/features/strength/server/sets";
import type { Step } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

// Every logged set of the whole circuit, one row each, grouped by round
// ascending then movement order; X deletes immediately (the modal is a
// deliberate context — no extra confirm), "Zapisz zmiany" updates dirty rows.
export function EditCircuitSetsDialog({
  step,
  open,
  onOpenChange,
}: {
  step: Step;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Conditional body mount = fresh drafts on every open (picker pattern). */}
        {open && <EditCircuitSetsBody step={step} close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EditCircuitSetsBody({ step, close }: { step: Step; close: () => void }) {
  const router = useRouter();
  const entries = loggedRoundNumbers(step.movements).flatMap((round) =>
    step.movements.flatMap((m) => {
      const s = m.sets.find((x) => x.setNumber === round);
      return s ? [{ movement: m, set: s }] : [];
    }),
  );
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(entries.map((e) => [e.set.id, toDraft(e.set)])),
  );
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleEntries = entries.filter((e) => !deletedIds.has(e.set.id));

  const patch = (setId: string, field: keyof RowDraft, value: string) =>
    setDrafts((prev) => ({ ...prev, [setId]: { ...prev[setId], [field]: value } }));

  const handleDelete = async (setId: string) => {
    setError(null);
    setDeletingId(setId);
    try {
      await deleteSet({ data: { setId } });
      setDeletedIds((prev) => new Set(prev).add(setId));
      await router.invalidate();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć serii."));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async () => {
    setError(null);
    const dirty = visibleEntries.filter((e) => draftDirty(e.set, drafts[e.set.id]));
    const invalid = dirty.find((e) => {
      const d = drafts[e.set.id];
      const isTime = e.movement.exerciseDefaultUnit === "TIME";
      return isTime ? d.durationSeconds === "" || Number(d.durationSeconds) < 1 : d.reps === "" || Number(d.reps) < 1;
    });
    if (invalid) {
      setError(`Uzupełnij wartości: ${invalid.movement.exerciseNamePl}.`);
      return;
    }
    setSaving(true);
    let wrote = false;
    try {
      for (const e of dirty) {
        await updateSet({ data: draftToPayload(e.set.id, drafts[e.set.id]) });
        wrote = true;
      }
      if (dirty.length > 0) await router.invalidate();
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
        <DialogTitle>Edytuj serie</DialogTitle>
        <DialogDescription>{step.movements.map((m) => m.exerciseNamePl).join(" + ")}</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-2">
        {visibleEntries.map(({ movement, set }) => {
          const d = drafts[set.id];
          const isTime = movement.exerciseDefaultUnit === "TIME";
          return (
            <div key={set.id}>
              <p className="mb-1 font-semibold text-sm">
                {movement.exerciseNamePl} · Seria {set.setNumber}
              </p>
              <div className="flex items-center gap-1.5">
                {isTime ? (
                  <NumericFormat
                    customInput={Input}
                    className="text-center font-bold tabular-nums"
                    inputMode="numeric"
                    decimalScale={0}
                    allowNegative={false}
                    isAllowed={(v) => v.value === "" || Number(v.value) <= 36000}
                    value={d.durationSeconds}
                    valueIsNumericString
                    onValueChange={(v) => patch(set.id, "durationSeconds", v.value)}
                    aria-label={`Sekundy: ${movement.exerciseNamePl} — seria ${set.setNumber}`}
                  />
                ) : (
                  <>
                    <NumericFormat
                      customInput={Input}
                      className="text-center font-bold tabular-nums"
                      inputMode="numeric"
                      decimalScale={0}
                      allowNegative={false}
                      isAllowed={(v) => v.value === "" || Number(v.value) <= 999}
                      value={d.reps}
                      valueIsNumericString
                      onValueChange={(v) => patch(set.id, "reps", v.value)}
                      aria-label={`Powtórzenia: ${movement.exerciseNamePl} — seria ${set.setNumber}`}
                    />
                    <NumericFormat
                      customInput={Input}
                      className="text-center font-bold text-primary tabular-nums"
                      inputMode="decimal"
                      decimalScale={2}
                      allowNegative={false}
                      isAllowed={(v) => v.value === "" || Number(v.value) <= 1000}
                      value={d.weightKg}
                      valueIsNumericString
                      onValueChange={(v) => patch(set.id, "weightKg", v.value)}
                      aria-label={`Ciężar: ${movement.exerciseNamePl} — seria ${set.setNumber}`}
                    />
                  </>
                )}
                <NumericFormat
                  customInput={Input}
                  className="w-14 shrink-0 text-center tabular-nums"
                  inputMode="numeric"
                  decimalScale={0}
                  allowNegative={false}
                  isAllowed={(v) => v.value === "" || (Number(v.value) >= 1 && Number(v.value) <= 10)}
                  value={d.rpe}
                  valueIsNumericString
                  onValueChange={(v) => patch(set.id, "rpe", v.value)}
                  aria-label={`RPE: ${movement.exerciseNamePl} — seria ${set.setNumber}`}
                />
                <button
                  type="button"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  onClick={() => handleDelete(set.id)}
                  disabled={deletingId !== null || saving}
                  aria-label={`Usuń serię ${set.setNumber}: ${movement.exerciseNamePl}`}
                >
                  {deletingId === set.id ? <Spinner size="sm" /> : <X className="size-4" />}
                </button>
              </div>
            </div>
          );
        })}
        {visibleEntries.length === 0 && <p className="py-4 text-center text-muted-foreground text-sm">Brak serii.</p>}
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 space-y-2 px-4 pb-4">
        <Button type="button" className="w-full bg-ember shadow-ember" disabled={saving} onClick={handleSave}>
          {saving ? "Zapisuję..." : "Zapisz zmiany"}
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
