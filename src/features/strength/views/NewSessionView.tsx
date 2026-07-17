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
import { WEEKDAY_FULL_PL, warsawWeekday } from "@/shared/lib/weekday";

const route = getRouteApi("/_shell/sessions/new");

export function NewSessionView() {
  const { type } = route.useSearch();
  const plan = route.useLoaderData();
  const navigate = useNavigate();
  // Tracks which action is in flight: "plan", "blank", or none.
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = warsawWeekday();
  const todayDay = plan.find((d) => d.dayOfWeek === today);
  // Only strength sessions seed from the plan's strength list.
  const planStrength = type === "STRENGTH" && todayDay?.hasStrength && todayDay.exercises.length > 0 ? todayDay : null;

  const start = async (fromPlanDay: boolean) => {
    setError(null);
    setCreating(fromPlanDay ? "plan" : "blank");
    try {
      const result = await createSession({
        // Local calendar date at click time (client tz): a session started
        // after local midnight gets today's date, not yesterday's.
        data: { type, date: dayjs().format("YYYY-MM-DD"), fromPlanDay },
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
          {planStrength ? "Zacznij z planu na dziś albo od zera." : "Zacznij od zera — sam dodajesz ćwiczenia."}
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

      {planStrength && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Dumbbell className="size-4 text-primary" />
              {WEEKDAY_FULL_PL[today]} — z planu
            </CardTitle>
            <CardDescription>{planStrength.exercises.map((e) => e.namePl).join(" · ")}</CardDescription>
          </CardHeader>
          <CardContent>
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
