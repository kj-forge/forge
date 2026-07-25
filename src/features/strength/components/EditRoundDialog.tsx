import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { NumericFormat } from "react-number-format";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { numToInputStr } from "@/features/strength/lib/set-form";
import { updateSet } from "@/features/strength/server/sets";
import { deleteRound } from "@/features/strength/server/steps";
import type { SetRow, Step } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";

type RowDraft = { reps: string; weightKg: string; durationSeconds: string; rpe: string };

const toDraft = (s: SetRow): RowDraft => ({
  reps: numToInputStr(s.reps ?? undefined),
  weightKg: numToInputStr(s.weightKg ?? undefined),
  durationSeconds: numToInputStr(s.durationSeconds ?? undefined),
  rpe: numToInputStr(s.rpe ?? undefined),
});

// One row per exercise that logged this round; movements without a set in the
// round (added or swapped in later) simply don't appear.
export function EditRoundDialog({ step, round, onClose }: { step: Step; round: number | null; onClose: () => void }) {
  return (
    <Dialog open={round !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>{round !== null && <EditRoundBody step={step} round={round} close={onClose} />}</DialogContent>
    </Dialog>
  );
}

function EditRoundBody({ step, round, close }: { step: Step; round: number; close: () => void }) {
  const router = useRouter();
  const entries = step.movements.flatMap((m) => {
    const set = m.sets.find((s) => s.setNumber === round);
    return set ? [{ movement: m, set }] : [];
  });
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(entries.map((e) => [e.set.id, toDraft(e.set)])),
  );
  const [saving, setSaving] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = (setId: string, field: keyof RowDraft, value: string) =>
    setDrafts((prev) => ({ ...prev, [setId]: { ...prev[setId], [field]: value } }));

  const handleSave = async () => {
    setError(null);
    const dirty = entries.filter((e) => {
      const d = drafts[e.set.id];
      return (
        d.reps !== numToInputStr(e.set.reps ?? undefined) ||
        d.weightKg !== numToInputStr(e.set.weightKg ?? undefined) ||
        d.durationSeconds !== numToInputStr(e.set.durationSeconds ?? undefined) ||
        d.rpe !== numToInputStr(e.set.rpe ?? undefined)
      );
    });
    const invalid = dirty.find((e) => {
      const d = drafts[e.set.id];
      const isTime = e.movement.exerciseDefaultUnit === "TIME";
      return isTime ? d.durationSeconds === "" || Number(d.durationSeconds) < 1 : d.reps === "" || Number(d.reps) < 1;
    });
    if (invalid) {
      setError(`Uzupełnij wartości: ${invalid.movement.exerciseNamePl}.`);
      return;
    }
    setSaving("save");
    let wrote = false;
    try {
      for (const e of dirty) {
        const d = drafts[e.set.id];
        await updateSet({
          data: {
            setId: e.set.id,
            reps: d.reps === "" ? null : Number(d.reps),
            weightKg: d.weightKg !== "" && Number(d.weightKg) > 0 ? Number(d.weightKg) : null,
            durationSeconds: d.durationSeconds === "" ? null : Number(d.durationSeconds),
            rpe: d.rpe === "" ? null : Number(d.rpe),
          },
        });
        wrote = true;
      }
      if (dirty.length > 0) await router.invalidate();
      close();
    } catch (err) {
      if (wrote) await router.invalidate();
      setError(getErrorMessage(err, "Nie udało się zapisać zmian."));
      setSaving(null);
    }
  };

  const handleDeleteRound = async () => {
    setError(null);
    setSaving("delete");
    try {
      await deleteRound({ data: { blockId: step.id, roundNumber: round } });
      await router.invalidate();
      close();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć rundy."));
      setSaving(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
      <DialogHeader className="shrink-0">
        <DialogTitle>Edytuj rundę {round}</DialogTitle>
        <DialogDescription>{step.movements.map((m) => m.exerciseNamePl).join(" + ")}</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-2">
        {entries.map(({ movement, set }) => {
          const d = drafts[set.id];
          const isTime = movement.exerciseDefaultUnit === "TIME";
          return (
            <div key={set.id}>
              <p className="mb-1 font-semibold text-sm">{movement.exerciseNamePl}</p>
              <div className="flex items-center gap-1.5">
                {isTime ? (
                  <NumericFormat
                    customInput={Input}
                    className="text-center font-bold tabular-nums"
                    placeholder="sek."
                    inputMode="numeric"
                    decimalScale={0}
                    allowNegative={false}
                    isAllowed={(v) => v.value === "" || Number(v.value) <= 36000}
                    value={d.durationSeconds}
                    valueIsNumericString
                    onValueChange={(v) => patch(set.id, "durationSeconds", v.value)}
                    aria-label={`Sekundy: ${movement.exerciseNamePl}`}
                  />
                ) : (
                  <>
                    <NumericFormat
                      customInput={Input}
                      className="text-center font-bold tabular-nums"
                      placeholder="powt."
                      inputMode="numeric"
                      decimalScale={0}
                      allowNegative={false}
                      isAllowed={(v) => v.value === "" || Number(v.value) <= 999}
                      value={d.reps}
                      valueIsNumericString
                      onValueChange={(v) => patch(set.id, "reps", v.value)}
                      aria-label={`Powtórzenia: ${movement.exerciseNamePl}`}
                    />
                    <NumericFormat
                      customInput={Input}
                      className="text-center font-bold text-primary tabular-nums"
                      placeholder="kg"
                      inputMode="decimal"
                      decimalScale={2}
                      allowNegative={false}
                      isAllowed={(v) => v.value === "" || Number(v.value) <= 1000}
                      value={d.weightKg}
                      valueIsNumericString
                      onValueChange={(v) => patch(set.id, "weightKg", v.value)}
                      aria-label={`Ciężar: ${movement.exerciseNamePl}`}
                    />
                  </>
                )}
                <NumericFormat
                  customInput={Input}
                  className="w-14 shrink-0 text-center tabular-nums"
                  placeholder="RPE"
                  inputMode="numeric"
                  decimalScale={0}
                  allowNegative={false}
                  isAllowed={(v) => v.value === "" || (Number(v.value) >= 1 && Number(v.value) <= 10)}
                  value={d.rpe}
                  valueIsNumericString
                  onValueChange={(v) => patch(set.id, "rpe", v.value)}
                  aria-label={`RPE: ${movement.exerciseNamePl}`}
                />
              </div>
            </div>
          );
        })}
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 space-y-2 px-4 pb-4">
        <Button type="button" className="w-full bg-ember shadow-ember" disabled={saving !== null} onClick={handleSave}>
          {saving === "save" ? "Zapisuję..." : "Zapisz zmiany"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full text-destructive hover:text-destructive"
          disabled={saving !== null}
          onClick={handleDeleteRound}
        >
          {saving === "delete" ? "Usuwam..." : `Usuń rundę ${round}`}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={close} disabled={saving !== null}>
          Anuluj
        </Button>
      </div>
    </div>
  );
}
