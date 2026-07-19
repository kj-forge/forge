import { NotebookPen } from "lucide-react";

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
import { formatRoundSet } from "@/features/strength/components/StepDrawer";
import { SET_KIND_COLOR, SET_KIND_LABEL } from "@/features/strength/constants";
import { maxLoggedRound } from "@/features/strength/lib/step-progress";
import type { SetKind, Step } from "@/features/strength/types";

// Read-only circuit summary for an ENDED session: rows = laps, columns =
// exercises. The active-session round view is not reused — no inputs, no
// mutations, just the table.
export function ViewOnlyCircuitDrawer({
  step,
  onOpenChange,
}: {
  step: Step | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={step !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {step ? (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-base leading-snug">
                {step.movements.map((m) => m.exerciseNamePl).join(" + ")}
              </DialogTitle>
              <DialogDescription>
                Obwód · {maxLoggedRound(step.movements)} {maxLoggedRound(step.movements) === 1 ? "runda" : "rund(y)"}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4">
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-2 py-1.5 font-medium">#</th>
                      {step.movements.map((m) => (
                        <th key={m.id} className="max-w-28 truncate px-2 py-1.5 font-medium">
                          {m.exerciseNamePl}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: maxLoggedRound(step.movements) }, (_, i) => i + 1).map((r) => {
                      const roundSets = step.movements.map((m) => m.sets.find((s) => s.setNumber === r));
                      const kind = (roundSets.find(Boolean)?.kind ?? "WORK") as SetKind;
                      return (
                        <tr key={r} className="border-b last:border-b-0">
                          <td
                            className={`px-2 py-1.5 font-medium ${SET_KIND_COLOR[kind]}`}
                            title={SET_KIND_LABEL[kind]}
                          >
                            {r}
                          </td>
                          {roundSets.map((s, col) => (
                            <td
                              key={step.movements[col].id}
                              className={`px-2 py-1.5 tabular-nums ${SET_KIND_COLOR[kind]}`}
                            >
                              {s ? formatRoundSet(s) : "—"}
                              {s?.rpe != null && <span className="text-muted-foreground"> @{s.rpe}</span>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {step.notes && (
                <p className="flex items-start gap-1.5 text-muted-foreground text-xs">
                  <NotebookPen className="mt-px size-3.5 shrink-0" />
                  <span className="whitespace-pre-wrap">{step.notes}</span>
                </p>
              )}
            </div>

            <DialogFooter className="shrink-0">
              <DialogClose asChild>
                <Button type="button" variant="outline" className="w-full">
                  Zamknij
                </Button>
              </DialogClose>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
