import { getRouteApi } from "@tanstack/react-router";
import { Target } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { PLAN_INTENSITY_CLASS, PLAN_INTENSITY_LABEL } from "@/features/plan/constants";
import type { PlanDay } from "@/features/plan/types";
import { WEEKDAY_FULL_PL, warsawWeekday } from "@/shared/lib/weekday";

const route = getRouteApi("/_shell/plan/");

export function PlanView() {
  const plan = route.useLoaderData();
  const byDay = new Map(plan.map((d) => [d.dayOfWeek, d]));
  // Deterministic across SSR and client — both pin Europe/Warsaw.
  const today = warsawWeekday();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4">
      <h1 className="pt-2 font-bold text-2xl tracking-tight">Plan tygodnia</h1>

      {plan.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Nie masz jeszcze planu tygodnia.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2">
          {WEEKDAY_FULL_PL.map((name, day) => (
            <DayCard key={name} name={name} entry={byDay.get(day)} isToday={day === today} />
          ))}
        </div>
      )}
    </main>
  );
}

function DayCard({ name, entry, isToday }: { name: string; entry: PlanDay | undefined; isToday: boolean }) {
  return (
    <div
      className={`rounded-xl border bg-card p-4 text-left ${
        isToday ? "border-primary/50 ring-1 ring-primary/30" : ""
      } ${entry ? "" : "border-dashed"}`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={`font-bold text-xs uppercase tracking-wide ${isToday ? "text-primary" : ""}`}>
          {name}
          {isToday && " · dziś"}
        </span>
        {entry && (
          <span
            className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] uppercase tracking-wide ${
              PLAN_INTENSITY_CLASS[entry.intensity]
            }`}
          >
            {PLAN_INTENSITY_LABEL[entry.intensity]}
          </span>
        )}
      </div>
      {entry ? (
        <>
          <p className="whitespace-pre-line text-sm">{entry.training}</p>
          {entry.goal && (
            <p className="mt-2 flex items-baseline gap-1.5 text-muted-foreground text-xs">
              <Target className="size-3 shrink-0 translate-y-px" />
              {entry.goal}
            </p>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">uzupełnij</p>
      )}
    </div>
  );
}
