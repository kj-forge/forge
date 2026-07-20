import { ArrowDown, ArrowUp, Coffee, Plus } from "lucide-react";
import { NumericFormat } from "react-number-format";

import { Input } from "@/components/ui/input";
import type { PlanUnit } from "@/features/plan/types";
import { ExerciseListPicker, type ExerciseOption } from "./ExerciseListPicker";

// Local editing shape: numeric fields as strings (iOS-safe), stable key for
// React while rows are reordered.
export interface UnitStepDraft {
  key: string;
  kind: "STRAIGHT_SETS" | "REST";
  targetRounds: string;
  durationMinutes: string;
  note: string;
  exercises: { exerciseId: string; namePl: string }[];
}

export function draftsFromUnitSteps(steps: PlanUnit["steps"] | undefined): UnitStepDraft[] {
  return (steps ?? []).map((s) => ({
    key: s.id,
    kind: s.kind,
    targetRounds: s.targetRounds !== null ? String(s.targetRounds) : "",
    durationMinutes: s.durationSeconds !== null ? String(Math.round((s.durationSeconds / 60) * 10) / 10) : "",
    note: s.note ?? "",
    exercises: s.exercises,
  }));
}

interface UnitStepsEditorProps {
  steps: UnitStepDraft[];
  onChange: (steps: UnitStepDraft[]) => void;
  allExercises: ExerciseOption[];
  onError: (message: string) => void;
}

// The unit's step structure: ordered workout steps (1 exercise = classic,
// 2+ = circuit with a round target) and REST breaks. Materialized 1:1 into
// session blocks when a session starts from this unit.
export function UnitStepsEditor({ steps, onChange, allExercises, onError }: UnitStepsEditorProps) {
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

  const add = (kind: UnitStepDraft["kind"]) =>
    onChange([
      ...steps,
      { key: crypto.randomUUID(), kind, targetRounds: "", durationMinutes: "", note: "", exercises: [] },
    ]);

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={step.key} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate font-medium text-sm">
              {step.kind === "REST" ? (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Coffee className="size-3.5" />
                  Przerwa
                </span>
              ) : step.exercises.length > 1 ? (
                `Krok ${i + 1} · obwód`
              ) : (
                `Krok ${i + 1}`
              )}
            </span>
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
              aria-label="Usuń krok"
              onClick={() => remove(step.key)}
              className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              ✕
            </button>
          </div>

          {step.kind === "REST" ? (
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
          ) : (
            <>
              <ExerciseListPicker
                allExercises={allExercises}
                picked={step.exercises}
                onChange={(exercises) => update(step.key, { exercises })}
                onError={onError}
              />
              {step.exercises.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">Docelowe obwody:</span>
                  <NumericFormat
                    customInput={Input}
                    className="w-16 text-center tabular-nums"
                    placeholder="∞"
                    inputMode="numeric"
                    decimalScale={0}
                    allowNegative={false}
                    isAllowed={(v) => v.value === "" || (Number(v.value) >= 1 && Number(v.value) <= 30)}
                    value={step.targetRounds}
                    valueIsNumericString
                    onValueChange={(v) => update(step.key, { targetRounds: v.value })}
                  />
                </div>
              )}
            </>
          )}
        </div>
      ))}

      <div className="flex gap-1.5">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed py-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => add("STRAIGHT_SETS")}
        >
          <Plus className="size-3.5" />
          Krok z ćwiczeniami
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed py-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => add("REST")}
        >
          <Coffee className="size-3.5" />
          Przerwa
        </button>
      </div>
    </div>
  );
}
