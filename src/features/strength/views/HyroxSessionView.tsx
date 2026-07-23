import { getRouteApi } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HyroxIdleScreen, HyroxRestScreen, HyroxStationScreen } from "@/features/strength/components/HyroxLiveScreens";
import { type HyroxLive, useHyroxLive } from "@/features/strength/components/useHyroxLive";
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

// Placeholder for the finish flow (block-done / whole-session summaries land
// in Task 8): current block's letter plus a CTA that either advances into the
// next block (still enabled — that transition itself needs no summary UI) or,
// on the last block, stops here disabled until the real finish screen exists.
function HyroxBlockDoneScreen({ live }: { live: HyroxLive }) {
  const { state, plan } = live;
  const letter = String.fromCharCode(65 + state.blockIndex);
  const hasNextBlock = state.phase === "blockDone" && state.blockIndex + 1 < plan.length;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4 pb-0">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">Blok {letter}</p>
        <h1 className="font-extrabold text-2xl">Blok zakończony</h1>
      </div>

      <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 border-t bg-background px-4 pt-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)-1.75rem))]">
        {live.syncError && (
          <p className="text-destructive text-xs" role="alert">
            {live.syncError}
          </p>
        )}
        {hasNextBlock ? (
          <Button type="button" className="w-full bg-ember py-5 font-extrabold text-lg shadow-ember" onClick={live.tap}>
            Start: Blok {String.fromCharCode(65 + state.blockIndex + 1)}
          </Button>
        ) : (
          <>
            <Button type="button" className="w-full py-5 font-extrabold text-lg" disabled>
              Zakończ trening
            </Button>
            <p className="text-center text-muted-foreground text-xs">(w budowie)</p>
          </>
        )}
      </div>
    </main>
  );
}

// Session view for HYROX-type sessions: read-only block preview until start,
// then Task 7's live screens driven entirely by useHyroxLive's phase. Ended
// sessions and empty (undeclared) sessions keep the original read-only cards
// — the live timeline only ever applies to an in-progress session with steps.
export function HyroxSessionView() {
  const { session, steps, segments } = route.useLoaderData();
  const live = useHyroxLive(session.id, steps, segments);

  if (session.endedAt !== null) {
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
      </main>
    );
  }

  if (steps.length === 0) {
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

        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Trening Hyrox deklarujesz w planie. Wystartuj sesję z planu, żeby dostać bloki i stoper.
          </CardContent>
        </Card>
      </main>
    );
  }

  switch (live.state.phase) {
    case "idle":
      return <HyroxIdleScreen live={live} />;
    case "station":
    case "rox":
      return <HyroxStationScreen live={live} />;
    case "rest":
      return <HyroxRestScreen live={live} />;
    case "blockDone":
    case "done":
      return <HyroxBlockDoneScreen live={live} />;
  }
}
