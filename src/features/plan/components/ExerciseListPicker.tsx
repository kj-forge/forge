import { useRouter } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { createExercise } from "@/features/strength/server/exercises";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

export type ExerciseOption = { id: string; namePl: string; aliases: string[] };
export type PickedExercise = { exerciseId: string; namePl: string };

// Search + inline create over the exercise catalogue: each confirmed pick
// hands one exercise to the caller and clears the query. Shared by the
// circuit picker below and the unit editor's single-exercise add.
export function ExerciseSearchField({
  allExercises,
  excludeIds,
  onPick,
  onError,
  autoFocus = false,
}: {
  allExercises: ExerciseOption[];
  excludeIds: string[];
  onPick: (exercise: { id: string; namePl: string }) => void;
  onError: (message: string) => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const pick = (e: { id: string; namePl: string }) => {
    setQuery("");
    onPick(e);
  };

  // Inline create, same defaults as the session picker — details are
  // editable later on /exercises.
  const handleCreate = async () => {
    const namePl = query.trim();
    if (namePl.length === 0 || creating) return;
    setCreating(true);
    try {
      const created = await createExercise({
        data: {
          namePl,
          category: "ACCESSORY",
          defaultUnit: "REPS",
          isMainLift: false,
          isPrTracked: true,
          isLoadedBodyweight: false,
          aliases: [],
        },
      });
      pick({ id: created.id, namePl });
      // Refresh the loader-fed catalogue so the new exercise is findable.
      await router.invalidate();
    } catch (err) {
      onError(getErrorMessage(err, "Nie udało się utworzyć ćwiczenia."));
    } finally {
      setCreating(false);
    }
  };

  const q = query.trim().toLowerCase();
  // Same match surface as the session picker: name OR any alias ("dip" must
  // find "Pompki na poręczach").
  const matches = q
    ? allExercises
        .filter(
          (e) =>
            !excludeIds.includes(e.id) &&
            (e.namePl.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q))),
        )
        .slice(0, 8)
    : [];

  return (
    <>
      <Input
        placeholder="Szukaj ćwiczenia…"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
      />
      {q.length > 0 && (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1">
          {matches.map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                onClick={() => pick(ex)}
              >
                {ex.namePl}
              </button>
            </li>
          ))}
          {/* Create only as the empty-state action, like the session picker. */}
          {matches.length === 0 && (
            <li>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded border border-dashed px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                onClick={handleCreate}
                disabled={creating}
              >
                <span className="font-medium text-primary">+ Dodaj „{query.trim()}”</span>
                {creating && <Spinner size="sm" className="text-muted-foreground" />}
              </button>
            </li>
          )}
        </ul>
      )}
    </>
  );
}

interface ExerciseListPickerProps {
  allExercises: ExerciseOption[];
  picked: PickedExercise[];
  onChange: (picked: PickedExercise[]) => void;
  onError: (message: string) => void;
}

// Ordered strength-exercise picker: search + inline create + up/down/remove.
// Extracted from the old plan-day drawer; now the circuit card's exercise
// list in the unit editor.
export function ExerciseListPicker({ allExercises, picked, onChange, onError }: ExerciseListPickerProps) {
  const addExercise = (e: { id: string; namePl: string }) => {
    if (!picked.some((p) => p.exerciseId === e.id)) {
      onChange([...picked, { exerciseId: e.id, namePl: e.namePl }]);
    }
  };

  const removeExercise = (id: string) => onChange(picked.filter((p) => p.exerciseId !== id));
  const moveExercise = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= picked.length) return;
    const next = [...picked];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {picked.length > 0 ? (
        <ul className="space-y-1">
          {picked.map((ex, i) => (
            <li key={ex.exerciseId} className="flex items-center gap-1 rounded-md border bg-card px-2.5 py-1.5 text-sm">
              <span className="w-4 shrink-0 text-muted-foreground text-xs tabular-nums">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{ex.namePl}</span>
              <button
                type="button"
                aria-label="W górę"
                disabled={i === 0}
                onClick={() => moveExercise(i, -1)}
                className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="W dół"
                disabled={i === picked.length - 1}
                onClick={() => moveExercise(i, 1)}
                className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
              >
                <ArrowDown className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Usuń ${ex.namePl}`}
                onClick={() => removeExercise(ex.exerciseId)}
                className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">
          Dodaj ćwiczenia w kolejności, w jakiej wykonujesz je w obwodzie.
        </p>
      )}

      <ExerciseSearchField
        allExercises={allExercises}
        excludeIds={picked.map((p) => p.exerciseId)}
        onPick={addExercise}
        onError={onError}
      />
    </div>
  );
}
