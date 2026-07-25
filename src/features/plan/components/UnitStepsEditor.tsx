import { ArrowDown, ArrowUp, Coffee, Plus } from "lucide-react";
import { useState } from "react";
import { NumericFormat } from "react-number-format";

import { Input } from "@/components/ui/input";
import type { PlanUnit } from "@/features/plan/types";
import { ExerciseListPicker, type ExerciseOption, ExerciseSearchField } from "./ExerciseListPicker";

// Local editing shape: numeric fields as strings (iOS-safe), stable key for
// React while rows are reordered.
export interface UnitStepDraft {
  key: string;
  kind: "STRAIGHT_SETS" | "REST";
  // Presentation-only: a circuit keeps its card (picker, rounds target) even
  // while it holds fewer than 2 exercises. The server derives the real shape
  // from the exercise count, so this never leaves the drawer.
  circuit: boolean;
  targetRounds: string;
  durationMinutes: string;
  note: string;
  exercises: { exerciseId: string; namePl: string }[];
}

export function draftsFromUnitSteps(steps: PlanUnit["steps"] | undefined): UnitStepDraft[] {
  return (steps ?? []).map((s) => ({
    key: s.id,
    kind: s.kind,
    circuit: s.kind === "STRAIGHT_SETS" && s.exercises.length > 1,
    targetRounds: s.targetRounds !== null ? String(s.targetRounds) : "",
    durationMinutes: s.durationSeconds !== null ? String(Math.round((s.durationSeconds / 60) * 10) / 10) : "",
    note: s.note ?? "",
    exercises: s.exercises,
  }));
}

const emptyDraft = (kind: UnitStepDraft["kind"], circuit: boolean): UnitStepDraft => ({
  key: crypto.randomUUID(),
  kind,
  circuit,
  targetRounds: "",
  durationMinutes: "",
  note: "",
  exercises: [],
});

const exerciseCountLabel = (n: number) =>
  n === 1 ? "1 ćwiczenie" : n >= 2 && n <= 4 ? `${n} ćwiczenia` : `${n} ćwiczeń`;

interface UnitStepsEditorProps {
  steps: UnitStepDraft[];
  onChange: (steps: UnitStepDraft[]) => void;
  allExercises: ExerciseOption[];
  onError: (message: string) => void;
}

// The unit's exercise/circuit list, built with the same vocabulary as the
// active session ("+ Ćwiczenie" / "+ Obwód"): a single exercise is a slim
// row that physically can't take a second one, a circuit is the one
// highlighted card with its own picker. Materialized 1:1 into session
// blocks when a session starts from this unit.
export function UnitStepsEditor({ steps, onChange, allExercises, onError }: UnitStepsEditorProps) {
  // "+ Ćwiczenie" opens one inline search; a pick appends a single-exercise
  // step and closes it.
  const [addingSingle, setAddingSingle] = useState(false);

  const update = (key: string, patch: Partial<UnitStepDraft>) =>
    onChange(steps.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  };

  const remove = (key: string) => onChange(steps.filter((s) => s.key !== key));

  const addSingle = (e: { id: string; namePl: string }) => {
    onChange([
      ...steps,
      { ...emptyDraft("STRAIGHT_SETS", false), exercises: [{ exerciseId: e.id, namePl: e.namePl }] },
    ]);
    setAddingSingle(false);
  };

  const stepControls = (step: UnitStepDraft, i: number, removeLabel: string) => (
    <>
      <button
        type="button"
        aria-label="W górę"
        disabled={i === 0}
        onClick={() => move(i, -1)}
        className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
      >
        <ArrowUp className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="W dół"
        disabled={i === steps.length - 1}
        onClick={() => move(i, 1)}
        className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
      >
        <ArrowDown className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={removeLabel}
        onClick={() => remove(step.key)}
        className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        ✕
      </button>
    </>
  );

  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        if (step.kind === "REST") {
          return (
            <div key={step.key} className="space-y-2 rounded-lg border border-dashed p-3">
              <div className="flex items-center gap-1">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 font-medium text-muted-foreground text-sm">
                  <Coffee className="size-3.5" />
                  Przerwa
                </span>
                {stepControls(step, i, "Usuń przerwę")}
              </div>
              <div className="flex items-center gap-2">
                <NumericFormat
                  customInput={Input}
                  className="w-24 text-center tabular-nums"
                  placeholder="min"
                  inputMode="decimal"
                  decimalScale={1}
                  allowNegative={false}
                  value={step.durationMinutes}
                  valueIsNumericString
                  onValueChange={(v) => update(step.key, { durationMinutes: v.value })}
                />
                <Input
                  placeholder="np. przerwa na zmianę stanowiska"
                  value={step.note}
                  onChange={(e) => update(step.key, { note: e.target.value })}
                  maxLength={500}
                />
              </div>
            </div>
          );
        }

        if (step.circuit) {
          return (
            <div key={step.key} className="space-y-2 rounded-lg border border-primary/40 p-3">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-[10px] text-primary uppercase tracking-wide">
                  Obwód
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
                  {exerciseCountLabel(step.exercises.length)}
                </span>
                {stepControls(step, i, "Usuń obwód")}
              </div>
              <ExerciseListPicker
                allExercises={allExercises}
                picked={step.exercises}
                onChange={(exercises) => update(step.key, { exercises })}
                onError={onError}
              />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Docelowe rundy:</span>
                <NumericFormat
                  customInput={Input}
                  className="w-16 text-center tabular-nums"
                  inputMode="numeric"
                  decimalScale={0}
                  allowNegative={false}
                  isAllowed={(v) => v.value === "" || (Number(v.value) >= 1 && Number(v.value) <= 30)}
                  value={step.targetRounds}
                  valueIsNumericString
                  onValueChange={(v) => update(step.key, { targetRounds: v.value })}
                />
              </div>
            </div>
          );
        }

        return (
          <div key={step.key} className="flex items-center gap-1 rounded-lg border bg-card px-2.5 py-2">
            <span className="min-w-0 flex-1 truncate font-medium text-sm">{step.exercises[0]?.namePl}</span>
            {stepControls(step, i, `Usuń ${step.exercises[0]?.namePl ?? "ćwiczenie"}`)}
          </div>
        );
      })}

      {addingSingle && (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">Dodaj ćwiczenie</span>
            <button
              type="button"
              className="text-muted-foreground text-xs underline-offset-4 hover:underline"
              onClick={() => setAddingSingle(false)}
            >
              Anuluj
            </button>
          </div>
          <ExerciseSearchField
            allExercises={allExercises}
            excludeIds={[]}
            onPick={addSingle}
            onError={onError}
            autoFocus
          />
        </div>
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed py-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => setAddingSingle(true)}
        >
          <Plus className="size-3.5" />
          Ćwiczenie
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed py-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => onChange([...steps, emptyDraft("STRAIGHT_SETS", true)])}
        >
          <Plus className="size-3.5" />
          Obwód
        </button>
        <button
          type="button"
          aria-label="Dodaj przerwę"
          title="Przerwa"
          className="flex items-center justify-center rounded-md border border-dashed px-3 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => onChange([...steps, emptyDraft("REST", false)])}
        >
          <Coffee className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
