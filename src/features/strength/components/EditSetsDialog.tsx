import { useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState } from "react";
import { NumericFormat } from "react-number-format";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatSeriesCount } from "@/features/strength/lib/format-set";
import { draftDirty, draftToPayload, type RowDraft, toDraft } from "@/features/strength/lib/set-draft";
import { deleteSet, updateSet } from "@/features/strength/server/sets";
import type { Movement } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

// All logged sets of one exercise in editable rows; X deletes immediately
// (the modal is a deliberate context — no extra confirm), "Zapisz zmiany"
// updates dirty rows.
export function EditSetsDialog({
  movement,
  open,
  onOpenChange,
}: {
  movement: Movement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Conditional body mount = fresh drafts on every open (picker pattern). */}
        {open && <EditSetsBody movement={movement} close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EditSetsBody({ movement, close }: { movement: Movement; close: () => void }) {
  const router = useRouter();
  const isTime = movement.exerciseDefaultUnit === "TIME";
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(movement.sets.map((s) => [s.id, toDraft(s)])),
  );
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleSets = movement.sets.filter((s) => !deletedIds.has(s.id));

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
    const dirty = visibleSets.filter((s) => draftDirty(s, drafts[s.id]));
    const invalid = dirty.find((s) => {
      const d = drafts[s.id];
      return isTime ? d.durationSeconds === "" || Number(d.durationSeconds) < 1 : d.reps === "" || Number(d.reps) < 1;
    });
    if (invalid) {
      setError(isTime ? "Podaj czas w sekundach." : "Podaj liczbę powtórzeń.");
      return;
    }
    setSaving(true);
    let wrote = false;
    try {
      for (const s of dirty) {
        await updateSet({ data: draftToPayload(s.id, drafts[s.id]) });
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
        <DialogDescription>
          {movement.exerciseNamePl} · {formatSeriesCount(visibleSets.length)}
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 pb-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
          <span className="w-5 shrink-0" />
          {isTime ? (
            <span className="flex-1 text-center">Sekundy</span>
          ) : (
            <>
              <span className="flex-1 text-center">Powtórzenia</span>
              <span className="flex-1 text-center">Ciężar (kg)</span>
            </>
          )}
          <span className="w-14 shrink-0 text-center">RPE</span>
          <span className="w-8 shrink-0" />
        </div>
        {visibleSets.map((s, i) => {
          const d = drafts[s.id];
          return (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-muted-foreground text-xs tabular-nums">{i + 1}.</span>
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
                  onValueChange={(v) => patch(s.id, "durationSeconds", v.value)}
                  aria-label={`Sekundy — seria ${i + 1}`}
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
                    onValueChange={(v) => patch(s.id, "reps", v.value)}
                    aria-label={`Powtórzenia — seria ${i + 1}`}
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
                    onValueChange={(v) => patch(s.id, "weightKg", v.value)}
                    aria-label={`Ciężar — seria ${i + 1}`}
                  />
                </>
              )}
              <NumericFormat
                customInput={Input}
                className="w-14 shrink-0 text-center tabular-nums"
                placeholder="—"
                inputMode="numeric"
                decimalScale={0}
                allowNegative={false}
                isAllowed={(v) => v.value === "" || (Number(v.value) >= 1 && Number(v.value) <= 10)}
                value={d.rpe}
                valueIsNumericString
                onValueChange={(v) => patch(s.id, "rpe", v.value)}
                aria-label={`RPE — seria ${i + 1}`}
              />
              <button
                type="button"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                onClick={() => handleDelete(s.id)}
                disabled={deletingId !== null || saving}
                aria-label={`Usuń serię ${i + 1}`}
              >
                {deletingId === s.id ? <Spinner size="sm" /> : <X className="size-4" />}
              </button>
            </div>
          );
        })}
        {visibleSets.length === 0 && <p className="py-4 text-center text-muted-foreground text-sm">Brak serii.</p>}
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 space-y-2 px-4 pb-4">
        <Button
          type="button"
          className="w-full bg-ember shadow-ember"
          disabled={saving || deletingId !== null}
          onClick={handleSave}
        >
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
