import { useRouter } from "@tanstack/react-router";
import { Flame, ListChecks, NotebookPen, Pencil, Repeat2, Zap } from "lucide-react";
import { useState } from "react";
import { NumericFormat } from "react-number-format";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ExerciseDrawerBody } from "@/features/strength/components/ExerciseDrawer";
import { StepNav } from "@/features/strength/components/StepNav";
import { SET_KIND_COLOR, SET_KIND_LABEL, VISIBLE_SET_KINDS } from "@/features/strength/constants";
import { fireConfetti } from "@/features/strength/lib/confetti";
import { formatSet } from "@/features/strength/lib/format-set";
import { numToInputStr } from "@/features/strength/lib/set-form";
import { currentRound, isActiveInRound, loggedRoundNumbers } from "@/features/strength/lib/step-progress";
import { removeExerciseFromSession, retireExerciseFromStep } from "@/features/strength/server/movements";
import { deleteRound, saveRound, updateStepNotes } from "@/features/strength/server/steps";
import type { Movement, SetKind, Step } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

interface StepDrawerProps {
  steps: Step[];
  // blockId of the open step; null while closed.
  openId: string | null;
  onOpenChange: (open: boolean) => void;
  onNavigate: (blockId: string) => void;
  // Opens the exercise picker in morph mode for this step.
  onAddToStep: (blockId: string) => void;
  // Opens the exercise picker in swap mode for this movement.
  onSwapInStep: (blockId: string, blockMovementId: string) => void;
}

// One drawer for the whole active session, selected by BLOCK id. The body is
// chosen by the step's shape: 1 movement → classic exercise logging, 2+ →
// round view, kind=REST → informational page.
export function StepDrawer({ steps, openId, onOpenChange, onNavigate, onAddToStep, onSwapInStep }: StepDrawerProps) {
  const step = steps.find((s) => s.id === openId) ?? null;
  const index = step ? steps.indexOf(step) : -1;
  const next = index >= 0 && index < steps.length - 1 ? steps[index + 1] : null;
  const nav = step ? <StepNav steps={steps} currentId={step.id} onNavigate={onNavigate} /> : null;

  return (
    <Dialog open={step !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {step === null ? null : step.kind === "REST" ? (
          <RestStepBody key={step.id} step={step} nav={nav} next={next} onNavigate={onNavigate} />
        ) : step.movements.length === 1 ? (
          <ExerciseDrawerBody key={step.movements[0].id} movement={step.movements[0]} nav={nav} />
        ) : (
          // Re-key per round: after a full round lands, the rows remount and
          // re-seed with carry-over values from the round just saved.
          <RoundBody
            key={`${step.id}:${currentRound(step.movements)}`}
            step={step}
            nav={nav}
            next={next}
            onNavigate={onNavigate}
            onAddToStep={() => onAddToStep(step.id)}
            onSwapExercise={(mid) => onSwapInStep(step.id, mid)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Round view (superset step)

type RowValues = { reps: string; weightKg: string; durationSeconds: string; rpe: number | null };

type RoundKind = "WARMUP" | "TOP_SET" | "BACK_OFF";

// Same chips as the classic picker (VISIBLE_SET_KINDS): nothing logged →
// warm up; otherwise mirror the previous lap — warm-up rounds usually come
// in series, so no auto-advance (legacy WORK falls back to BACK_OFF).
function suggestRoundKind(lastLapKind: string | null): RoundKind {
  if (lastLapKind === null) return "WARMUP";
  return lastLapKind === "WARMUP" || lastLapKind === "TOP_SET" || lastLapKind === "BACK_OFF" ? lastLapKind : "BACK_OFF";
}

// Seed a row from the movement's latest logged set (usually the previous
// round), falling back to the TOP_SET/BACK_OFF history reference.
function seedRow(movement: Movement): RowValues {
  const latest = movement.sets.at(-1);
  if (latest) {
    return {
      reps: numToInputStr(latest.reps ?? undefined),
      weightKg: numToInputStr(latest.weightKg ?? undefined),
      durationSeconds: numToInputStr(latest.durationSeconds ?? undefined),
      rpe: null,
    };
  }
  const ref = movement.lastByKind.TOP_SET ?? movement.lastByKind.BACK_OFF;
  return {
    reps: numToInputStr(ref?.reps ?? undefined),
    weightKg: numToInputStr(ref?.weightKg ?? undefined),
    durationSeconds: "",
    rpe: null,
  };
}

function rowToEntry(movementId: string, isTime: boolean, values: RowValues) {
  const reps = values.reps === "" ? undefined : Number(values.reps);
  const weightKg = values.weightKg === "" ? undefined : Number(values.weightKg);
  const durationSeconds = values.durationSeconds === "" ? undefined : Number(values.durationSeconds);
  if (isTime) {
    if (durationSeconds === undefined || durationSeconds < 1) return null;
    return { blockMovementId: movementId, durationSeconds, rpe: values.rpe ?? undefined };
  }
  if (reps === undefined) return null;
  return {
    blockMovementId: movementId,
    reps,
    // 0 = bodyweight, same semantics as the classic form.
    weightKg: weightKg !== undefined && weightKg > 0 ? weightKg : undefined,
    rpe: values.rpe ?? undefined,
  };
}

// TIME sets render as seconds; everything else exactly like the classic view
// ("3× 132.5kg", "10× bw"). Shared with the read-only circuit table.
export function formatRoundSet(s: Movement["sets"][number]): string {
  if (s.durationSeconds !== null && s.reps === null) return `${s.durationSeconds}s`;
  return formatSet(s);
}

function RoundBody({
  step,
  nav,
  next,
  onNavigate,
  onAddToStep,
  onSwapExercise,
}: {
  step: Step;
  nav: React.ReactNode;
  next: Step | null;
  onNavigate: (blockId: string) => void;
  onAddToStep: () => void;
  onSwapExercise: (blockMovementId: string) => void;
}) {
  const router = useRouter();
  const round = currentRound(step.movements);
  const activeMovements = step.movements.filter((m) => isActiveInRound(m, round));

  const [rows, setRows] = useState<Record<string, RowValues>>(() =>
    Object.fromEntries(activeMovements.map((m) => [m.id, seedRow(m)])),
  );
  // One kind per lap — stamps every exercise saved in it. Re-suggested on the
  // per-lap remount from the previous lap's kind.
  const [roundKind, setRoundKind] = useState<RoundKind>(() => {
    const lastLap = round - 1;
    const lastKind = step.movements.flatMap((m) => m.sets).find((s) => s.setNumber === lastLap)?.kind ?? null;
    return suggestRoundKind(lastKind);
  });
  const [saving, setSaving] = useState<string | "round" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(step.notes ?? "");
  const [deletingRound, setDeletingRound] = useState<number | null>(null);
  const [movementAction, setMovementAction] = useState<Movement | null>(null);

  const savedThisRound = new Set(
    activeMovements.filter((m) => m.sets.some((s) => s.setNumber === round)).map((m) => m.id),
  );

  const firePrToasts = (
    results: Awaited<ReturnType<typeof saveRound>>,
    entries: { blockMovementId: string; reps?: number; weightKg?: number }[],
  ) => {
    for (const r of results) {
      if (!r.pr?.isNewPR) continue;
      const movement = step.movements.find((m) => m.id === r.blockMovementId);
      const entry = entries.find((e) => e.blockMovementId === r.blockMovementId);
      if (!movement || !entry || entry.weightKg === undefined) continue;
      const plus = movement.exerciseIsLoadedBodyweight ? "+" : "";
      fireConfetti();
      toast(`Nowy rekord: ${movement.exerciseNamePl}!`, {
        description: `${entry.reps}× ${plus}${entry.weightKg} kg (było ${r.pr.previousBest.reps}× ${plus}${r.pr.previousBest.weightKg} kg)`,
        icon: <Flame className="size-5 text-primary" />,
        className: "shadow-ember",
      });
    }
  };

  // "Zapisz rundę i dalej": batch-save every unsaved row, then advance — to
  // the next step once the target is met, otherwise to the next round (the
  // data change re-keys this body).
  const saveWholeRound = async () => {
    const pending = activeMovements.filter((m) => !savedThisRound.has(m.id));
    const entries = [];
    for (const m of pending) {
      const entry = rowToEntry(m.id, m.exerciseDefaultUnit === "TIME", rows[m.id]);
      if (!entry) {
        setError(`Uzupełnij wartości: ${m.exerciseNamePl}.`);
        return;
      }
      entries.push(entry);
    }
    setError(null);
    if (entries.length > 0) {
      setSaving("round");
      try {
        const results = await saveRound({
          data: { blockId: step.id, roundNumber: round, kind: roundKind, entries },
        });
        firePrToasts(results, entries);
        await router.invalidate();
      } catch (err) {
        setError(getErrorMessage(err, "Nie udało się zapisać rundy."));
        setSaving(null);
        return;
      }
      setSaving(null);
    }
    if (step.targetRounds !== null && round >= step.targetRounds && next) {
      onNavigate(next.id);
    }
  };

  const handleDeleteRound = async (roundNumber: number) => {
    setDeletingRound(roundNumber);
    setError(null);
    try {
      await deleteRound({ data: { blockId: step.id, roundNumber } });
      await router.invalidate();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć rundy."));
    } finally {
      setDeletingRound(null);
    }
  };

  const removeMovement = async (movement: Movement) => {
    setError(null);
    setSaving(movement.id);
    setMovementAction(null);
    try {
      if (movement.sets.length === 0) {
        await removeExerciseFromSession({ data: { blockMovementId: movement.id } });
      } else {
        await retireExerciseFromStep({ data: { blockMovementId: movement.id, fromRound: round } });
      }
      await router.invalidate();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć ćwiczenia z obwodu."));
    } finally {
      setSaving(null);
    }
  };

  const saveNote = async () => {
    try {
      await updateStepNotes({ data: { blockId: step.id, notes: noteDraft } });
      await router.invalidate();
      setNoteOpen(false);
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się zapisać notatki."));
    }
  };

  // Ascending, like the classic "W tej sesji" list — same reading order in
  // both step shapes.
  const loggedRounds = loggedRoundNumbers(step.movements);

  const title = activeMovements.map((m) => m.exerciseNamePl).join(" + ");
  const targetLabel = step.targetRounds !== null ? ` / ${step.targetRounds}` : "";
  const isLastTargetRound = step.targetRounds !== null && round >= step.targetRounds;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
      <DialogHeader className="shrink-0">
        <DialogTitle className="text-base leading-snug">{title}</DialogTitle>
        {/* Position/round context lives in the carousel and the counter —
            repeating it here confused more than helped. sr-only keeps the
            dialog described for screen readers. */}
        <DialogDescription className="sr-only">Logowanie obwodu: {title}</DialogDescription>
      </DialogHeader>

      <div className="shrink-0 px-4 pt-1 pb-2">{nav}</div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4">
        <div className="flex items-baseline justify-between">
          <p className="font-bold text-base tabular-nums">
            Runda {round}
            <span className="font-medium text-muted-foreground text-sm">{targetLabel}</span>
          </p>
        </div>

        {/* Round-level kind — one row of chips stamps the whole round. */}
        <div className="grid grid-cols-3 gap-1.5">
          {VISIBLE_SET_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`rounded-md border px-2 py-1.5 font-semibold text-xs transition-colors ${
                roundKind === k ? "border-transparent bg-ember" : "border-border text-muted-foreground hover:bg-accent"
              }`}
              onClick={() => setRoundKind(k as RoundKind)}
            >
              {SET_KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {activeMovements.map((m) => {
          const isTime = m.exerciseDefaultUnit === "TIME";
          const values = rows[m.id] ?? seedRow(m);
          const saved = savedThisRound.has(m.id);
          return (
            <div key={m.id} className={`rounded-lg border p-3 ${saved ? "opacity-60" : ""}`}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-semibold text-sm">{m.exerciseNamePl}</p>
                <button
                  type="button"
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                  onClick={() => setMovementAction(m)}
                  disabled={saving !== null}
                  aria-label={`Edytuj ćwiczenie: ${m.exerciseNamePl}`}
                >
                  <Pencil className="size-3.5" />
                </button>
              </div>
              <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                {isTime ? (
                  <span className="flex-1 text-center">Sekundy</span>
                ) : (
                  <>
                    <span className="flex-1 text-center">Powtórzenia</span>
                    <span className="flex-1 text-center">Ciężar (kg)</span>
                  </>
                )}
                <span className="w-16 shrink-0 text-center">RPE 6–10</span>
              </div>
              <div className="flex items-center gap-1.5">
                {isTime ? (
                  <NumericFormat
                    customInput={Input}
                    className="text-center font-bold tabular-nums"
                    placeholder="sek."
                    inputMode="numeric"
                    decimalScale={0}
                    allowNegative={false}
                    value={values.durationSeconds}
                    valueIsNumericString
                    onValueChange={(v) =>
                      setRows((prev) => ({ ...prev, [m.id]: { ...values, durationSeconds: v.value } }))
                    }
                    disabled={saved}
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
                      value={values.reps}
                      valueIsNumericString
                      onValueChange={(v) => setRows((prev) => ({ ...prev, [m.id]: { ...values, reps: v.value } }))}
                      disabled={saved}
                    />
                    <NumericFormat
                      customInput={Input}
                      className="text-center font-bold text-primary tabular-nums"
                      placeholder="kg"
                      inputMode="decimal"
                      decimalScale={2}
                      allowNegative={false}
                      value={values.weightKg}
                      valueIsNumericString
                      onValueChange={(v) => setRows((prev) => ({ ...prev, [m.id]: { ...values, weightKg: v.value } }))}
                      disabled={saved}
                    />
                  </>
                )}
                <NumericFormat
                  customInput={Input}
                  className="w-16 shrink-0 text-center tabular-nums"
                  placeholder="RPE"
                  inputMode="numeric"
                  decimalScale={0}
                  allowNegative={false}
                  isAllowed={(v) => v.value === "" || (Number(v.value) >= 1 && Number(v.value) <= 10)}
                  value={values.rpe === null ? "" : String(values.rpe)}
                  valueIsNumericString
                  onValueChange={(v) =>
                    setRows((prev) => ({
                      ...prev,
                      [m.id]: { ...values, rpe: v.value === "" ? null : Number(v.value) },
                    }))
                  }
                  disabled={saved}
                />
              </div>
            </div>
          );
        })}

        {loggedRounds.length > 0 && (
          <div className="rounded-lg bg-muted/50 p-3 text-xs">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <ListChecks className="size-3.5 text-primary" />W tej sesji:
            </p>
            <ul className="space-y-0.5">
              {loggedRounds.map((r) => {
                const roundSets = step.movements.map((m) => m.sets.find((x) => x.setNumber === r));
                const kind = (roundSets.find(Boolean)?.kind ?? "WORK") as SetKind;
                return (
                  <li key={r} className="flex items-center justify-between gap-2">
                    <span className={`tabular-nums ${SET_KIND_COLOR[kind]}`}>
                      {r}. {SET_KIND_LABEL[kind]} · {roundSets.map((s) => (s ? formatRoundSet(s) : "—")).join(" · ")}
                    </span>
                    <button
                      type="button"
                      className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground text-xs hover:text-destructive disabled:opacity-50"
                      onClick={() => handleDeleteRound(r)}
                      disabled={deletingRound !== null}
                      aria-label={`Usuń rundę ${r}`}
                    >
                      {deletingRound === r ? <Spinner size="sm" /> : "✕"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {noteOpen ? (
          <div className="space-y-2">
            <Textarea
              rows={2}
              placeholder="np. ciężko poszło, za tydzień −2,5 kg?"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              maxLength={1000}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setNoteOpen(false)}>
                Anuluj
              </Button>
              <Button type="button" size="sm" className="flex-1 bg-ember" onClick={saveNote}>
                Zapisz notatkę
              </Button>
            </div>
          </div>
        ) : (
          // One shared row: the note (existing text or the affordance) next
          // to the morph action — vertical space is precious mid-workout.
          <div className="flex items-stretch gap-1.5">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-1.5 rounded-md border border-dashed px-2 py-2 text-left font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => {
                setNoteDraft(step.notes ?? "");
                setNoteOpen(true);
              }}
            >
              <NotebookPen className="mt-px size-3.5 shrink-0" />
              {step.notes ? <span className="truncate whitespace-pre-wrap">{step.notes}</span> : "Notatka do obwodu…"}
            </button>
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed px-2 py-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
              onClick={onAddToStep}
            >
              + Ćwiczenie do obwodu
            </button>
          </div>
        )}

        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      <DialogFooter className="shrink-0 gap-2">
        <Button
          type="button"
          className="w-full bg-ember shadow-ember"
          size="lg"
          disabled={saving !== null}
          onClick={saveWholeRound}
        >
          {saving === "round" ? (
            "Zapisuję..."
          ) : (
            <>
              <Zap className="size-4" />
              {isLastTargetRound && next ? "Zapisz rundę i dalej →" : "Zapisz rundę"}
            </>
          )}
        </Button>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="w-full">
            Zamknij
          </Button>
        </DialogClose>
      </DialogFooter>

      <Dialog open={movementAction !== null} onOpenChange={(o) => !o && setMovementAction(null)}>
        <DialogContent>
          {movementAction && (
            <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
              <DialogHeader className="shrink-0">
                <DialogTitle>{movementAction.exerciseNamePl}</DialogTitle>
                <DialogDescription>Ćwiczenie w obwodzie · od rundy {round}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const m = movementAction;
                    setMovementAction(null);
                    onSwapExercise(m.id);
                  }}
                >
                  <Repeat2 className="size-4" />
                  Zamień na inne ćwiczenie
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => removeMovement(movementAction)}
                >
                  {movementAction.sets.length === 0 ? "Usuń z obwodu" : "Usuń z obwodu (od tej rundy)"}
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => setMovementAction(null)}>
                  Anuluj
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// REST step — informational page, no sets, no timer (self-paced by design).

function RestStepBody({
  step,
  nav,
  next,
  onNavigate,
}: {
  step: Step;
  nav: React.ReactNode;
  next: Step | null;
  onNavigate: (blockId: string) => void;
}) {
  const minutes = step.durationSeconds !== null ? Math.round((step.durationSeconds / 60) * 10) / 10 : null;
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
      <DialogHeader className="shrink-0">
        <DialogTitle>Przerwa{minutes !== null ? ` · ${minutes} min` : ""}</DialogTitle>
        <DialogDescription>Brak serii do zapisania — przejdź dalej, gdy skończysz.</DialogDescription>
      </DialogHeader>

      <div className="shrink-0 px-4 pt-1 pb-2">{nav}</div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4">
        {step.notes && (
          <div className="rounded-lg bg-muted/50 p-3 text-muted-foreground text-sm">
            <p className="whitespace-pre-wrap">{step.notes}</p>
          </div>
        )}
      </div>

      <DialogFooter className="shrink-0 gap-2">
        {next && (
          <Button type="button" className="w-full bg-ember shadow-ember" size="lg" onClick={() => onNavigate(next.id)}>
            Dalej →
          </Button>
        )}
        <DialogClose asChild>
          <Button type="button" variant="outline" className="w-full">
            Zamknij
          </Button>
        </DialogClose>
      </DialogFooter>
    </div>
  );
}
