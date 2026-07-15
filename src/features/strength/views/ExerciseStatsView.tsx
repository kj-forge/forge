import { getRouteApi, Link } from "@tanstack/react-router";
import { ChevronLeft, Trophy } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { E1rmSparkline, formatChartDate } from "@/features/strength/components/E1rmSparkline";
import { formatSetsCompactParts } from "@/features/strength/lib/format-sets-compact";

const route = getRouteApi("/_shell/stats/$slug");

const DATE_FMT = new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

export function ExerciseStatsView() {
  const data = route.useLoaderData();

  if (!data) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        <BackLink />
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Nie znaleziono ćwiczenia.
          </CardContent>
        </Card>
      </main>
    );
  }

  const { exercise, best, points, history, isLoadedBw } = data;
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div>
        <BackLink />
        <h1 className="mt-1 font-bold text-2xl tracking-tight">{exercise.namePl}</h1>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <Trophy className="size-5 text-primary" />
          <div>
            <p className="font-bold text-[10.5px] text-muted-foreground uppercase tracking-widest">Rekord</p>
            <p className="text-muted-foreground text-xs">
              {best ? DATE_FMT.format(new Date(best.date)) : "brak danych"}
            </p>
          </div>
        </div>
        {best && (
          <div className="text-right">
            <p className="font-black text-lg text-primary tabular-nums">
              {best.reps}× {isLoadedBw ? `+${best.weightKg}` : best.weightKg} kg
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              e1RM {best.e1rm !== null ? `~${best.e1rm} kg` : "—"}
            </p>
          </div>
        )}
      </div>

      {points.length >= 2 && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2.5 font-bold text-[10.5px] text-muted-foreground uppercase tracking-widest">
            Trend e1RM · {points.length} sesji
          </p>
          <E1rmSparkline points={points} className="h-28 w-full" />
          <div className="flex justify-between text-[10.5px] text-muted-foreground tabular-nums">
            <span>
              {formatChartDate(first.date)} · {first.e1rm}
            </span>
            <span>
              {formatChartDate(last.date)} · <b className="text-primary">{last.e1rm}</b>
            </span>
          </div>
        </div>
      )}

      <section className="rounded-2xl border bg-card p-4">
        <p className="mb-1.5 font-bold text-[10.5px] text-muted-foreground uppercase tracking-widest">
          Historia · ostatnie {history.length} sesji
        </p>
        {history.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground text-sm">
            Jeszcze brak zakończonych sesji z tym ćwiczeniem.
          </p>
        ) : (
          <ul className="divide-y">
            {history.map((h) => (
              <li key={h.date + h.e1rm} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block text-muted-foreground text-xs">{DATE_FMT.format(new Date(h.date))}</span>
                  <span className="tabular-nums">
                    {formatSetsCompactParts(h.sets, { loadedBodyweight: isLoadedBw }).map((p, i) => (
                      <span key={`${p.weight}-${p.reps}`}>
                        {i > 0 && <span className="text-muted-foreground"> · </span>}
                        {p.weight !== null && <b className="font-semibold">{p.weight} </b>}
                        <span className="text-muted-foreground">{p.reps}</span>
                      </span>
                    ))}
                  </span>
                </span>
                {h.e1rm !== null && (
                  <span className="shrink-0 font-black text-primary text-sm tabular-nums">{h.e1rm}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {history.length > 0 && !isLoadedBw && (
          <p className="mt-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">e1RM sesji · kg</p>
        )}
      </section>
    </main>
  );
}

function BackLink() {
  return (
    <Link
      to="/stats"
      className="inline-flex items-center gap-0.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" />
      Statystyki
    </Link>
  );
}
