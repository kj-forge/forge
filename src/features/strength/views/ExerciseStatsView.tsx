import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { SquarePen, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { E1rmSparkline, formatChartDate } from "@/features/strength/components/E1rmSparkline";
import { ExerciseEditorDrawer } from "@/features/strength/components/ExerciseEditorDrawer";
import { formatSetsCompactParts } from "@/features/strength/lib/format-sets-compact";
import { BackLink } from "@/shared/components/BackLink";

const route = getRouteApi("/_shell/stats/$slug");

const DATE_FMT = new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

export function ExerciseStatsView() {
  const data = route.useLoaderData();
  const navigate = useNavigate();
  const [editorOpen, setEditorOpen] = useState(false);

  if (!data) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
        <BackLink to="/stats" label="Statystyki" />
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
        <BackLink to="/stats" label="Statystyki" />
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="min-w-0 truncate font-bold text-2xl tracking-tight">{exercise.namePl}</h1>
          <button
            type="button"
            aria-label={`Edytuj ćwiczenie ${exercise.namePl}`}
            className="grid size-9 shrink-0 place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => setEditorOpen(true)}
          >
            <SquarePen className="size-4" />
          </button>
        </div>
      </div>

      <ExerciseEditorDrawer
        open={editorOpen}
        exercise={exercise}
        onClose={() => setEditorOpen(false)}
        onSaved={() =>
          toast("Ćwiczenie zapisane", {
            description: "Zmiany widoczne w wyszukiwarce, planie i rekordach.",
            action: { label: "Ćwiczenia →", onClick: () => navigate({ to: "/exercises" }) },
          })
        }
      />

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
            {/* A real 1RM needs no estimate — Epley only annotates rep sets. */}
            {best.e1rm !== null && best.reps > 1 && (
              <p className="text-muted-foreground text-xs tabular-nums">e1RM ~{best.e1rm} kg</p>
            )}
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
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <p className="font-bold text-[10.5px] text-muted-foreground uppercase tracking-widest">
            Historia · ostatnie {history.length} sesji
          </p>
          {/* Column caption sits over the values it describes (right column). */}
          {history.length > 0 && !isLoadedBw && (
            <p className="shrink-0 text-[10px] text-muted-foreground uppercase tracking-wide">e1RM · kg</p>
          )}
        </div>
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
      </section>
    </main>
  );
}
