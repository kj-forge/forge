import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ChartNoAxesColumn,
  Clock,
  Dumbbell,
  Flag,
  type LucideIcon,
  Table2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import type { DashboardData, Trend } from "@/features/dashboard/server/dashboard";
import { formatGoalTarget, goalDisplayTitle, goalProgress } from "@/features/goals/lib/goal-progress";
import {
  UNIT_INTENSITY_CLASS,
  UNIT_INTENSITY_DOT,
  UNIT_INTENSITY_LABEL,
  type UnitIntensity,
} from "@/features/plan/constants";
import { unitTrainingLabel } from "@/features/plan/lib/plan-display";
import { type ScheduleEntry, warsawTodayIso } from "@/features/plan/lib/schedule";
import { E1rmSparkline, formatChartDate } from "@/features/strength/components/E1rmSparkline";
import { SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import { formatSet } from "@/features/strength/lib/format-set";
import type { SessionType } from "@/features/strength/types";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { WEEKDAY_FULL_PL, WEEKDAY_LABELS_PL, warsawWeekday } from "@/shared/lib/weekday";

const DATE_FMT = new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

// One look for every tile; whole-tile links add the interactive hover, tiles
// with clickable rows/chips inside stay static (the elements carry hover).
export const TILE_CLASS = "min-w-0 rounded-2xl border bg-card p-4";
export const TILE_INTERACTIVE_CLASS = "block transition-colors hover:border-foreground/25 hover:bg-accent/30";

export function TileHeader({
  icon: Icon,
  title,
  action,
  accent = false,
}: {
  icon: LucideIcon;
  title: string;
  // String inside whole-tile links (nested anchors are invalid HTML);
  // element-level tiles pass a real <Link> here.
  action?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`mb-2.5 flex items-center gap-1.5 font-bold text-[10.5px] uppercase tracking-widest ${
        accent ? "text-primary" : "text-muted-foreground"
      }`}
    >
      <Icon className={`size-3.5 ${accent ? "" : "text-primary"}`} />
      {title}
      {action && (
        <span className="ml-auto font-medium text-muted-foreground normal-case tracking-normal">{action}</span>
      )}
    </div>
  );
}

export function Tile({
  icon,
  title,
  action,
  children,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${TILE_CLASS} ${className}`}>
      <TileHeader icon={icon} title={title} action={action} />
      {children}
    </section>
  );
}

export function TodayTile({ schedule, className = "" }: { schedule: DashboardData["schedule"]; className?: string }) {
  // Resolved schedule: a workout dragged onto today shows up here too.
  const today = warsawTodayIso();
  const entries = schedule.entries.filter((e) => e.date === today);

  return (
    <Link
      to="/plan"
      // Nothing scheduled at all → land on the library, not an empty week.
      search={schedule.entries.length === 0 ? { tab: "plany" } : undefined}
      className={`min-w-0 rounded-2xl border border-primary/40 bg-linear-to-br from-primary/10 to-transparent p-4 ${TILE_INTERACTIVE_CLASS} hover:border-primary/70 ${className}`}
    >
      <TileHeader icon={CalendarDays} title="Dziś wg planu" action="plan →" accent />
      <div className="mb-1 flex items-center gap-2">
        <span className="font-black text-lg">{WEEKDAY_FULL_PL[warsawWeekday()]}</span>
      </div>
      {entries.length > 0 ? (
        <div className="space-y-2.5">
          {entries.map((entry) => (
            <TodayTileEntry key={`${entry.source}:${entry.overrideId ?? entry.unitId}`} entry={entry} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {schedule.entries.length === 0 ? "Ułóż plan treningowy — Home podpowie, co dziś robisz." : "Dziś wolne."}
        </p>
      )}
    </Link>
  );
}

function TodayTileEntry({ entry }: { entry: ScheduleEntry }) {
  const label = unitTrainingLabel(entry);
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate font-semibold text-sm">{entry.name}</span>
        {entry.intensity && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 font-bold text-[10px] uppercase tracking-wide ${UNIT_INTENSITY_CLASS[entry.intensity]}`}
          >
            {UNIT_INTENSITY_LABEL[entry.intensity]}
          </span>
        )}
        <span className="shrink-0 text-muted-foreground text-xs">
          {entry.source === "ADHOC" ? "poza planem" : entry.planName}
        </span>
      </div>
      {label && label !== entry.name && <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed">{label}</p>}
      {entry.exercises.length > 0 && (
        <p className="mt-1 flex items-baseline gap-1.5 text-muted-foreground text-xs">
          <Dumbbell className="size-3 shrink-0 translate-y-px text-primary" />
          {entry.exercises.map((e) => e.namePl).join(" · ")}
        </p>
      )}
      {(entry.goal ?? entry.note) && (
        <p className="mt-1 text-muted-foreground text-xs">Cel: {entry.goal ?? entry.note}</p>
      )}
    </div>
  );
}

// Always the last FINISHED session — active ones live at the top of the
// SessionsTile list next door, with their live badges.
export function LastSessionTile({ sessions }: { sessions: DashboardData["sessions"] }) {
  const last = sessions.find((s) => s.endedAt !== null);

  if (!last) {
    return (
      <Tile icon={Clock} title="Ostatnia sesja">
        <p className="text-muted-foreground text-sm">Jeszcze brak sesji.</p>
      </Tile>
    );
  }

  const top = last.exercises.find((e) => e.weightKg !== null || e.reps !== null);

  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: last.id }}
      state={{ sessionOrigin: "dziennik" }}
      className={`${TILE_CLASS} ${TILE_INTERACTIVE_CLASS}`}
    >
      <TileHeader icon={Clock} title="Ostatnia sesja" />
      <p className="font-semibold text-sm">{SESSION_TYPE_LABEL_PL[last.type as SessionType] ?? last.type}</p>
      <p className="text-muted-foreground text-xs">{DATE_FMT.format(new Date(last.date))}</p>
      {top && (
        <p className="mt-2 font-black text-base text-primary tabular-nums">
          {formatSet(top)}
          <span className="ml-1.5 font-normal text-muted-foreground text-xs">{top.name}</span>
        </p>
      )}
    </Link>
  );
}

export function GoalTile({ goals, compact = false }: { goals: DashboardData["goals"]; compact?: boolean }) {
  // With several goals the tile becomes a slow carousel — auto-rotation is
  // motion, so it stays off for prefers-reduced-motion users.
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (goals.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % goals.length), 6000);
    return () => clearInterval(id);
  }, [goals.length]);

  if (goals.length === 0) {
    return (
      <Link to="/goals" className={`${TILE_CLASS} ${TILE_INTERACTIVE_CLASS}`}>
        <TileHeader icon={Flag} title="Cel" />
        <p className="text-muted-foreground text-sm">Ustaw cel →</p>
      </Link>
    );
  }

  const goal = goals[index % goals.length];
  const progress = goalProgress(goal.targetValue, goal.currentBest?.weightKg ?? null);
  const target = formatGoalTarget(goal.targetValue, goal.targetUnit, goal.targetReps);

  return (
    <Link to="/goals" className={`${TILE_CLASS} ${TILE_INTERACTIVE_CLASS}`}>
      <TileHeader icon={Flag} title={goals.length > 1 ? "Cele" : "Cel"} action={compact ? undefined : "cele →"} />
      <div
        key={goal.id}
        className={`motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:animate-in motion-safe:duration-300 ${
          compact ? "min-h-23" : "min-h-25"
        }`}
      >
        {/* Fixed two-line box: short titles don't shrink it, long ones clamp
            with an ellipsis — carousel slides keep one height either way. */}
        <p className={`line-clamp-2 font-black text-primary ${compact ? "h-12 text-base" : "h-14 text-lg"}`}>
          {goalDisplayTitle(goal)}
        </p>
        {progress !== null && (
          <div className="my-2 h-1.5 overflow-hidden rounded-full bg-muted-foreground/25">
            <div className="h-full rounded-full bg-ember" style={{ width: `${progress}%` }} />
          </div>
        )}
        {/* The target already sits in the title ("… 160kg @3RM") — down here
            only the current best, as a real set. */}
        <p className="mt-1 text-muted-foreground text-xs tabular-nums">
          {goal.currentBest
            ? `najlepsze ${goal.currentBest.reps}× ${goal.currentBest.weightKg}kg`
            : target
              ? `cel ${target}`
              : ""}
        </p>
      </div>
      {goals.length > 1 && (
        <div className="mt-2 flex gap-1">
          {goals.map((g, i) => (
            <span
              key={g.id}
              className={`h-1.5 w-3 rounded-full transition-colors ${
                i === index % goals.length ? "bg-primary" : "bg-muted-foreground/40"
              }`}
            />
          ))}
        </div>
      )}
    </Link>
  );
}

export function PrTile({ prs, compact = false }: { prs: DashboardData["prs"]; compact?: boolean }) {
  // Mobile bento: the rows are too small to be individual tap targets — the
  // whole tile is one link to the stats list (like GoalTile). Desktop keeps
  // per-row deep links to /stats/$slug plus the header action.
  if (compact) {
    return (
      <Link to="/stats" className={`${TILE_CLASS} ${TILE_INTERACTIVE_CLASS} h-full`}>
        <TileHeader icon={Trophy} title="Rekordy" />
        <ul className="space-y-0.5">
          {/* Minimal by design: the record is the weight, full stop. Reps and
              the e1RM estimate live one tap away, on the stats page. */}
          {prs.map((pr) => (
            <li key={pr.exerciseId} className="flex items-baseline justify-between gap-2 py-0.5 text-xs">
              <span className="truncate">{pr.namePl}</span>
              <span className="font-black text-primary tabular-nums">
                {pr.best ? `${pr.isLoadedBodyweight ? "+" : ""}${pr.best.weightKg}` : "—"}
              </span>
            </li>
          ))}
        </ul>
      </Link>
    );
  }

  return (
    <Tile
      icon={Trophy}
      title="Rekordy"
      action={
        <Link to="/stats" className="transition-colors hover:text-foreground">
          statystyki →
        </Link>
      }
    >
      <ul>
        {prs.map((pr) => (
          <li key={pr.exerciseId}>
            <Link
              to="/stats/$slug"
              params={{ slug: pr.slug }}
              className="-mx-1.5 flex items-baseline justify-between gap-2 rounded-md px-1.5 py-1.5 text-sm transition-colors hover:bg-accent/60"
            >
              <span className="truncate">{pr.namePl}</span>
              <span className="font-black text-primary tabular-nums">
                {pr.best ? `${pr.isLoadedBodyweight ? "+" : ""}${pr.best.weightKg}` : "—"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">rekord · kg</p>
    </Tile>
  );
}

export function SessionsTile({
  sessions,
  className = "",
}: {
  sessions: DashboardData["sessions"];
  className?: string;
}) {
  // Active sessions first (their badge marks them), then most recent — the
  // same order as the mobile list.
  const rows = [...sessions.filter((s) => s.endedAt === null), ...sessions.filter((s) => s.endedAt !== null)].slice(
    0,
    3,
  );
  return (
    <Tile
      icon={ChartNoAxesColumn}
      title="Ostatnie sesje"
      action={
        <Link to="/sessions" className="transition-colors hover:text-foreground">
          historia →
        </Link>
      }
      className={className}
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Jeszcze brak sesji.</p>
      ) : (
        <ul>
          {rows.map((s) => {
            const top = s.exercises.find((e) => e.weightKg !== null || e.reps !== null);
            return (
              <li key={s.id}>
                <Link
                  to="/sessions/$sessionId"
                  params={{ sessionId: s.id }}
                  state={{ sessionOrigin: "dziennik" }}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent/60"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold">
                        {s.title ?? SESSION_TYPE_LABEL_PL[s.type as SessionType] ?? s.type}
                      </span>
                      <StatusBadge endedAt={s.endedAt} />
                    </span>
                    <span className="block text-muted-foreground text-xs">{DATE_FMT.format(new Date(s.date))}</span>
                  </span>
                  {top && (
                    <span className="shrink-0 text-right font-bold text-primary text-sm tabular-nums">
                      {formatSet(top)}
                      <span className="block font-normal text-muted-foreground text-xs">{top.name}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Tile>
  );
}

const INTENSITY_RANK: Record<UnitIntensity, number> = { HARD: 3, MEDIUM: 2, EASY: 1 };

export function WeekTile({ schedule }: { schedule: DashboardData["schedule"] }) {
  const today = warsawTodayIso();
  return (
    <Link
      to="/plan"
      search={schedule.entries.length === 0 ? { tab: "plany" } : undefined}
      className={`${TILE_CLASS} ${TILE_INTERACTIVE_CLASS}`}
    >
      <TileHeader icon={CalendarDays} title="Tydzień" action="plan →" />
      {schedule.entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">Ułóż plan treningowy →</p>
      ) : (
        <ul className="space-y-1.5">
          {schedule.dates.map((date, day) => {
            const entries = schedule.entries.filter((e) => e.date === date);
            // Dot = the day's highest intensity; ad-hoc-only days get a
            // neutral filled dot, free days stay muted.
            const top = entries.reduce<UnitIntensity | null>(
              (acc, e) =>
                e.intensity && (!acc || INTENSITY_RANK[e.intensity] > INTENSITY_RANK[acc]) ? e.intensity : acc,
              null,
            );
            const isToday = date === today;
            return (
              <li
                key={date}
                className={`flex items-center gap-2 text-xs ${
                  isToday ? "font-bold text-foreground" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    top ? UNIT_INTENSITY_DOT[top] : entries.length > 0 ? "bg-muted-foreground/40" : "bg-muted"
                  }`}
                />
                <span className="w-8 shrink-0">{WEEKDAY_LABELS_PL[day]}</span>
                <span className="truncate">{entries.length > 0 ? entries.map((e) => e.name).join(" · ") : "—"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Link>
  );
}

export function TrendTile({ trend, className = "" }: { trend: Trend; className?: string }) {
  const first = trend.points[0];
  const last = trend.points[trend.points.length - 1];

  return (
    <Link
      to="/stats/$slug"
      params={{ slug: trend.slug }}
      className={`${TILE_CLASS} ${TILE_INTERACTIVE_CLASS} ${className}`}
    >
      <TileHeader icon={TrendingUp} title={`${trend.namePl} — trend e1RM`} action="szczegóły →" />
      <E1rmSparkline points={trend.points} />
      <div className="flex justify-between text-[10.5px] text-muted-foreground tabular-nums">
        <span>
          {formatChartDate(first.date)} · {first.e1rm}
        </span>
        <span>
          {formatChartDate(last.date)} · <b className="text-primary">{last.e1rm}</b>
        </span>
      </div>
    </Link>
  );
}

export function ZestawieniaTile({ counts }: { counts: DashboardData["weekdayCounts"] }) {
  return (
    <Tile icon={Table2} title="Zestawienia">
      <p className="mb-2.5 text-muted-foreground text-xs">Porównaj treningi z tego samego dnia tygodnia.</p>
      {counts.length === 0 ? (
        <p className="text-muted-foreground text-sm">Zaloguj kilka sesji, a podpowiemy Twoje dni.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {counts.map((c) => (
            <Link
              key={c.weekday}
              to="/stats"
              search={{ seg: "zestawienia", dzien: c.weekday }}
              className="rounded-lg border px-2.5 py-1.5 font-bold text-xs transition-colors hover:bg-accent"
            >
              {WEEKDAY_LABELS_PL[c.weekday]}
              <span className="ml-1.5 font-normal text-muted-foreground">{c.count}</span>
            </Link>
          ))}
        </div>
      )}
    </Tile>
  );
}
