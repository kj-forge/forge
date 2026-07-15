import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight } from "lucide-react";

import { PLAN_INTENSITY_CLASS, PLAN_INTENSITY_LABEL } from "@/features/plan/constants";
import type { PlanDay } from "@/features/plan/types";
import { WEEKDAY_FULL_PL, warsawWeekday } from "@/shared/lib/weekday";

// The mobile entry point to /plan — the tab bar has no plan tab, so this
// card (or its dashed teaser) is always rendered on Home.
export function TodayPlanCard({ plan }: { plan: PlanDay[] }) {
  const today = warsawWeekday();
  const entry = plan.find((d) => d.dayOfWeek === today);

  if (plan.length === 0) {
    return (
      <Link
        to="/plan"
        className="rounded-xl border border-dashed px-4 py-3 text-muted-foreground text-sm transition-colors hover:bg-accent"
      >
        Ustaw plan tygodnia →
      </Link>
    );
  }

  return (
    <Link
      to="/plan"
      className="relative block rounded-2xl border border-primary/40 bg-linear-to-br from-primary/10 to-transparent p-4 transition-colors hover:border-primary/60"
    >
      <p className="flex items-center gap-1.5 font-bold text-[10px] text-primary uppercase tracking-widest">
        <CalendarDays className="size-3.5" />
        Dziś wg planu
      </p>
      {entry ? (
        <>
          <div className="mt-1.5 mb-1 flex items-center gap-2">
            <span className="font-bold text-base">{WEEKDAY_FULL_PL[today]}</span>
            <span
              className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] uppercase tracking-wide ${
                PLAN_INTENSITY_CLASS[entry.intensity]
              }`}
            >
              {PLAN_INTENSITY_LABEL[entry.intensity]}
            </span>
          </div>
          {entry.training ? (
            <p className="line-clamp-3 whitespace-pre-line text-sm">{entry.training}</p>
          ) : (
            <p className="text-muted-foreground text-sm">Brak aktywności w planie na dziś.</p>
          )}
          {entry.goal && <p className="mt-1.5 text-muted-foreground text-xs">Cel: {entry.goal}</p>}
        </>
      ) : (
        <p className="mt-1.5 text-muted-foreground text-sm">Brak planu na dziś — uzupełnij w widoku planu.</p>
      )}
      <ChevronRight className="absolute top-4 right-4 size-4 text-muted-foreground" />
    </Link>
  );
}
