import { getRouteApi } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/shared/components/StatusBadge";

const route = getRouteApi("/_shell/sessions/$sessionId");

function formatTarget(movement: { targetReps: number | null; targetDistanceM: number | null }): string | null {
  if (movement.targetReps !== null) return `${movement.targetReps} powt.`;
  if (movement.targetDistanceM !== null) return `${movement.targetDistanceM} m`;
  return null;
}

function formatRest(restSeconds: number | null): string | null {
  if (restSeconds === null) return null;
  const minutes = Math.floor(restSeconds / 60);
  const seconds = restSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Skeleton per Stage 2 Task 5: header + read-only block cards, no stopwatch
// yet (Tasks 7-8 wire the live timeline onto sessionSegments).
export function HyroxSessionView() {
  const { session, steps } = route.useLoaderData();

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4 pb-0">
      <header className="flex items-center justify-end pt-2">
        <span className="text-muted-foreground text-xs">
          {new Date(session.date).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </header>

      <div className="space-y-2">
        <h1 className="font-bold text-2xl tracking-tight">Sesja Hyrox</h1>
        <StatusBadge endedAt={session.endedAt} />
      </div>

      {steps.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Trening Hyrox deklarujesz w planie. Wystartuj sesję z planu, żeby dostać bloki i stoper.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {steps.map((step, i) => {
            const meta = [
              step.targetRounds !== null ? `${step.targetRounds} rund` : null,
              formatRest(step.restSeconds) ? `przerwa ${formatRest(step.restSeconds)}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={step.id}>
                <Card>
                  <CardHeader>
                    <CardTitle>Blok {String.fromCharCode(65 + i)}</CardTitle>
                    {meta && <p className="text-muted-foreground text-xs">{meta}</p>}
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {step.movements.map((movement) => (
                      <div key={movement.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{movement.exerciseNamePl}</span>
                        {formatTarget(movement) && (
                          <span className="text-muted-foreground text-xs">{formatTarget(movement)}</span>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 border-t bg-background px-4 pt-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)-1.75rem))]">
        <Button type="button" className="w-full bg-ember shadow-ember" disabled>
          Stoper (w budowie)
        </Button>
      </div>
    </main>
  );
}
