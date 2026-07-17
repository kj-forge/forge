import { getRouteApi, useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import { Dumbbell } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PICKABLE_SESSION_TYPES,
  SESSION_TYPE_LABEL_PL,
  SESSION_TYPE_LABEL_PL_ADJ,
} from "@/features/strength/constants";
import { createSession } from "@/features/strength/server/sessions";
import { getErrorMessage } from "@/lib/error-message";
import { WEEKDAY_FULL_PL, WEEKDAY_LABELS_PL, warsawWeekday } from "@/shared/lib/weekday";

const route = getRouteApi("/_shell/sessions/new");

export function NewSessionView() {
  const { type } = route.useSearch();
  const plan = route.useLoaderData();
  const navigate = useNavigate();
  // Tracks which action is in flight: "plan", "blank", or none.
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = warsawWeekday();
  // Only strength sessions seed from the plan. Any strength day is startable —
  // a missed Tuesday runs on Wednesday without editing the plan; today's day
  // is just the default pick.
  const strengthDays = plan.filter((d) => d.hasStrength && d.exercises.length > 0);
  const [planDay, setPlanDay] = useState<number>(
    () => (strengthDays.find((d) => d.dayOfWeek === today) ?? strengthDays[0])?.dayOfWeek ?? today,
  );
  const planStrength = type === "STRENGTH" && strengthDays.length > 0 ? strengthDays : null;
  const pickedDay = strengthDays.find((d) => d.dayOfWeek === planDay);

  const start = async (fromPlanDay: boolean) => {
    setError(null);
    setCreating(fromPlanDay ? "plan" : "blank");
    try {
      const result = await createSession({
        // Local calendar date at click time (client tz): a session started
        // after local midnight gets today's date, not yesterday's.
        data: {
          type,
          date: dayjs().format("YYYY-MM-DD"),
          fromPlanDay,
          planDayOfWeek: fromPlanDay ? planDay : undefined,
        },
      });
      navigate({ to: "/sessions/$sessionId", params: { sessionId: result.sessionId } });
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się utworzyć sesji."));
      setCreating(null);
    }
  };

  const adj = SESSION_TYPE_LABEL_PL_ADJ[type];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="space-y-1 pt-2">
        <h1 className="font-bold text-2xl tracking-tight">{adj ? `Nowa sesja ${adj}` : "Nowa sesja"}</h1>
        <p className="text-muted-foreground text-sm">
          {planStrength
            ? "Zacznij z planu (dowolny dzień siłowy) albo od zera."
            : "Zacznij od zera — sam dodajesz ćwiczenia."}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {PICKABLE_SESSION_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded-md border px-2 py-1.5 font-semibold text-xs transition-colors ${
              type === t ? "border-transparent bg-ember" : "border-border text-muted-foreground hover:bg-accent"
            }`}
            disabled={creating !== null}
            onClick={() => navigate({ to: ".", search: { type: t }, replace: true })}
          >
            {SESSION_TYPE_LABEL_PL[t]}
          </button>
        ))}
      </div>

      {planStrength && pickedDay && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Dumbbell className="size-4 text-primary" />
              {WEEKDAY_FULL_PL[pickedDay.dayOfWeek]} — z planu{pickedDay.dayOfWeek === today ? " (dziś)" : ""}
            </CardTitle>
            <CardDescription>{pickedDay.exercises.map((e) => e.namePl).join(" · ")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* A missed day can be run today — pick any strength day; the
                plan itself stays untouched. */}
            {planStrength.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {planStrength.map((d) => (
                  <button
                    key={d.dayOfWeek}
                    type="button"
                    disabled={creating !== null}
                    className={`rounded-md border px-2.5 py-1.5 font-semibold text-xs transition-colors ${
                      d.dayOfWeek === planDay
                        ? "border-transparent bg-ember"
                        : "border-border text-muted-foreground hover:bg-accent"
                    }`}
                    onClick={() => setPlanDay(d.dayOfWeek)}
                  >
                    {WEEKDAY_LABELS_PL[d.dayOfWeek]}
                    {d.dayOfWeek === today ? " · dziś" : ""}
                  </button>
                ))}
              </div>
            )}
            <Button className="w-full bg-ember shadow-ember" onClick={() => start(true)} disabled={creating !== null}>
              {creating === "plan" ? "Tworzę..." : "Zacznij trening z planu"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pusta sesja</CardTitle>
          <CardDescription>Zacznij od zera — sam dodajesz ćwiczenia.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant={planStrength ? "outline" : "default"}
            className={planStrength ? "w-full" : "w-full bg-ember shadow-ember"}
            onClick={() => start(false)}
            disabled={creating !== null}
          >
            {creating === "blank" ? "Tworzę..." : "Pusta sesja"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
