import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, Dumbbell } from "lucide-react";

import { UNIT_INTENSITY_CLASS, UNIT_INTENSITY_LABEL } from "@/features/plan/constants";
import { unitTrainingLabel } from "@/features/plan/lib/plan-display";
import { type ScheduleEntry, warsawTodayIso } from "@/features/plan/lib/schedule";
import type { WeekSchedule } from "@/features/plan/types";
import { WEEKDAY_FULL_PL, warsawWeekday } from "@/shared/lib/weekday";

// The mobile entry point to /plan — the tab bar has no plan tab, so this
// card (or its dashed teaser) is always rendered on Home. Entries come from
// the RESOLVED schedule, so a workout moved onto today shows up here.
export function TodayPlanCard({ schedule }: { schedule: WeekSchedule }) {
  const today = warsawTodayIso();
  const entries = schedule.entries.filter((e) => e.date === today);

  // A whole empty week ≈ nothing planned at all → the setup teaser.
  if (schedule.entries.length === 0) {
    return (
      <Link
        to="/plan"
        search={{ tab: "plany" }}
        className="rounded-xl border border-dashed px-4 py-3 text-muted-foreground text-sm transition-colors hover:bg-accent"
      >
        Ustaw plan treningowy →
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
      <div className="mt-1.5 mb-1 flex items-center gap-2">
        <span className="font-bold text-base">{WEEKDAY_FULL_PL[warsawWeekday()]}</span>
      </div>
      {entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <TodayEntry key={`${entry.source}:${entry.overrideId ?? entry.unitId}`} entry={entry} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Dziś wolne.</p>
      )}
      <ChevronRight className="absolute top-4 right-4 size-4 text-muted-foreground" />
    </Link>
  );
}

function TodayEntry({ entry }: { entry: ScheduleEntry }) {
  const label = unitTrainingLabel(entry);
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate font-medium text-sm">{entry.name}</span>
        {entry.intensity && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 font-bold text-[10px] uppercase tracking-wide ${UNIT_INTENSITY_CLASS[entry.intensity]}`}
          >
            {UNIT_INTENSITY_LABEL[entry.intensity]}
          </span>
        )}
        <span className="shrink-0 text-muted-foreground text-xs">
          {entry.source === "ADHOC" ? "poza planem" : entry.planName}
        </span>
      </div>
      {label && label !== entry.name && (
        <p className="wrap-break-word mt-0.5 line-clamp-2 whitespace-pre-line text-muted-foreground text-sm">{label}</p>
      )}
      {entry.exercises.length > 0 && (
        <p className="mt-0.5 flex items-baseline gap-1.5 text-muted-foreground text-xs">
          <Dumbbell className="size-3 shrink-0 translate-y-px text-primary" />
          {entry.exercises.map((e) => e.namePl).join(" · ")}
        </p>
      )}
      {(entry.goal ?? entry.note) && (
        <p className="mt-0.5 text-muted-foreground text-xs">Cel: {entry.goal ?? entry.note}</p>
      )}
    </div>
  );
}
