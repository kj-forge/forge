import { Target } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ExerciseOption, GoalDrawer } from "@/features/goals/components/GoalDrawer";
import { GOAL_TYPE_LABEL } from "@/features/goals/constants";
import { formatGoalTarget } from "@/features/goals/lib/goal-progress";
import type { GoalRow } from "@/features/goals/types";

const GOAL_DATE_FMT = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric", timeZone: "UTC" });

export function GoalsSection({ goals, exercises }: { goals: GoalRow[]; exercises: ExerciseOption[] }) {
  const [editing, setEditing] = useState<{ goal: GoalRow | null } | null>(null);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Cele</CardTitle>
        <CardDescription>Kierunek treningu — siła, czas wyścigu, sylwetka.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {goals.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <Target className="size-8 text-muted-foreground/60" />
            <p className="text-muted-foreground text-sm">Nie masz jeszcze celu.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {goals.map((goal) => (
              <li key={goal.id}>
                <button
                  type="button"
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent/60"
                  onClick={() => setEditing({ goal })}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-sm">{goal.title}</span>
                    <span className="block text-muted-foreground text-xs">
                      {GOAL_TYPE_LABEL[goal.type]}
                      {goal.targetDate ? ` · ${GOAL_DATE_FMT.format(new Date(goal.targetDate))}` : ""}
                      {goal.exerciseNamePl ? ` · ${goal.exerciseNamePl}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {goal.currentBestKg !== null ? (
                      <>
                        <span className="block font-black text-base text-primary tabular-nums">
                          {goal.currentBestKg}
                        </span>
                        <span className="block text-muted-foreground text-xs tabular-nums">
                          cel {formatGoalTarget(goal.targetValue, goal.targetUnit, goal.targetReps) ?? "—"}
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold text-sm tabular-nums">
                        {formatGoalTarget(goal.targetValue, goal.targetUnit, goal.targetReps) ?? "—"}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="outline" className="w-full" onClick={() => setEditing({ goal: null })}>
          + Dodaj cel
        </Button>
      </CardContent>

      <GoalDrawer
        open={editing !== null}
        goal={editing?.goal ?? null}
        exercises={exercises}
        onClose={() => setEditing(null)}
      />
    </Card>
  );
}
