import { useRouter } from "@tanstack/react-router";
import { Dumbbell, Repeat2 } from "lucide-react";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { formatRoundSet } from "@/features/strength/components/StepDrawer";
import { SET_KIND_COLOR, SET_KIND_LABEL } from "@/features/strength/constants";
import { formatSeriesCount, formatSet } from "@/features/strength/lib/format-set";
import { maxLoggedRound } from "@/features/strength/lib/step-progress";
import { removeExerciseFromSession } from "@/features/strength/server/movements";
import { removeStep } from "@/features/strength/server/steps";
import type { SetKind, Step } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

// An ended session shows RESULTS, not navigation: every step renders its full
// log inline — no drawer, no extra taps. The only action left is cleaning up
// a never-logged step (inline ✕; the server guards on zero sets).
export function EndedStepCard({ step }: { step: Step }) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCircuit = step.movements.length > 1;
  const laps = maxLoggedRound(step.movements);
  const isEmpty = laps === 0;

  const handleRemove = async () => {
    setError(null);
    setRemoving(true);
    try {
      if (isCircuit) await removeStep({ data: { blockId: step.id } });
      else await removeExerciseFromSession({ data: { blockMovementId: step.movements[0].id } });
      await router.invalidate();
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć ćwiczenia."));
      setRemoving(false);
    }
  };

  const title = step.movements.map((m) => m.exerciseNamePl).join(" + ");
  const subtitle = isCircuit
    ? `obwód · ${laps} ${laps === 1 ? "obwód" : laps < 5 ? "obwody" : "obwodów"}`
    : formatSeriesCount(step.movements[0]?.sets.length ?? 0);

  return (
    <div className="flex items-stretch gap-1">
      <Card className="min-w-0 flex-1">
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              {isCircuit ? <Repeat2 className="size-5" /> : <Dumbbell className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-sm">{title}</p>
              <p className="text-muted-foreground text-xs">{isEmpty ? "bez zalogowanych serii" : subtitle}</p>
            </div>
          </div>

          {!isEmpty && (
            <ul className="mt-2 space-y-0.5 pl-12 text-xs tabular-nums">
              {isCircuit
                ? Array.from({ length: laps }, (_, i) => i + 1).map((r) => {
                    const roundSets = step.movements.map((m) => m.sets.find((s) => s.setNumber === r));
                    const kind = (roundSets.find(Boolean)?.kind ?? "WORK") as SetKind;
                    return (
                      <li key={r} className={SET_KIND_COLOR[kind]}>
                        {r}. {SET_KIND_LABEL[kind]} · {roundSets.map((s) => (s ? formatRoundSet(s) : "—")).join(" · ")}
                      </li>
                    );
                  })
                : step.movements[0].sets.map((s, i) => (
                    <li key={s.id} className={SET_KIND_COLOR[s.kind as SetKind]}>
                      {i + 1}. {SET_KIND_LABEL[s.kind as SetKind]} · {formatSet(s)}
                      {s.rpe !== null && ` · RPE ${s.rpe}`}
                    </li>
                  ))}
            </ul>
          )}

          {error && (
            <p className="mt-2 pl-12 text-destructive text-xs" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {isEmpty && (
        <button
          type="button"
          className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          onClick={handleRemove}
          disabled={removing}
          aria-label={`Usuń ${title}`}
        >
          {removing ? <Spinner size="sm" /> : "✕"}
        </button>
      )}
    </div>
  );
}
