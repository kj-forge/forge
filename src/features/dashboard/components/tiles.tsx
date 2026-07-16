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
import { formatGoalTarget, goalProgress } from "@/features/goals/lib/goal-progress";
import { PLAN_INTENSITY_CLASS, PLAN_INTENSITY_DOT, PLAN_INTENSITY_LABEL } from "@/features/plan/constants";
import { planTrainingLabel } from "@/features/plan/lib/plan-display";
import { E1rmSparkline, formatChartDate } from "@/features/strength/components/E1rmSparkline";
import { SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import { formatSet } from "@/features/strength/lib/format-set";
import type { SessionType } from "@/features/strength/types";
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

export function TodayTile({ plan, className = "" }: { plan: DashboardData["plan"]; className?: string }) {
  const today = warsawWeekday();
  const entry = plan.find((d) => d.dayOfWeek === today);

  return (
    <Link
      to="/plan"
      className={`min-w-0 rounded-2xl border border-primary/40 bg-linear-to-br from-primary/10 to-transparent p-4 ${TILE_INTERACTIVE_CLASS} hover:border-primary/70 ${className}`}
    >
      <TileHeader icon={CalendarDays} title="Dziś wg planu" action="plan →" accent />
      {entry ? (
        <>
          <div className="mb-1 flex items-center gap-2">
            <span className="font-black text-lg">{WEEKDAY_FULL_PL[today]}</span>
            <span
              className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] uppercase tracking-wide ${
                PLAN_INTENSITY_CLASS[entry.intensity]
              }`}
            >
              {PLAN_INTENSITY_LABEL[entry.intensity]}
            </span>
          </div>
          {planTrainingLabel(entry) ? (
            <p className="whitespace-pre-line text-sm leading-relaxed">{planTrainingLabel(entry)}</p>
          ) : (
            <p className="text-muted-foreground text-sm">Brak aktywności w planie na dziś.</p>
          )}
          {entry.hasStrength && entry.exercises.length > 0 && (
            <p className="mt-2 flex items-baseline gap-1.5 text-muted-foreground text-xs">
              <Dumbbell className="size-3 shrink-0 translate-y-px text-primary" />
              {entry.exercises.map((e) => e.namePl).join(" · ")}
            </p>
          )}
          {entry.goal && <p className="mt-2 text-muted-foreground text-xs">Cel: {entry.goal}</p>}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          {plan.length === 0 ? "Ułóż plan tygodnia — Home podpowie, co dziś robisz." : "Brak planu na dziś."}
        </p>
      )}
    </Link>
  );
}

export function LastSessionTile({ sessions }: { sessions: DashboardData["sessions"] }) {
  const active = sessions.find((s) => s.endedAt === null);
  const last = sessions.find((s) => s.endedAt !== null);

  if (active) {
    return (
      <Link
        to="/sessions/$sessionId"
        params={{ sessionId: active.id }}
        className={`${TILE_CLASS} ${TILE_INTERACTIVE_CLASS}`}
      >
        <TileHeader icon={Clock} title="Aktywna sesja" />
        <p className="flex items-center gap-2 font-semibold text-sm">
          <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
          {SESSION_TYPE_LABEL_PL[active.type as SessionType] ?? active.type}
        </p>
        <p className="mt-1 font-black text-base text-primary">Wróć do sesji →</p>
      </Link>
    );
  }

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
  const progress = goalProgress(goal.targetValue, goal.currentE1rm);
  const target = formatGoalTarget(goal.targetValue, goal.targetUnit);

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
          {goal.title}
        </p>
        {progress !== null && (
          <div className="my-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-ember" style={{ width: `${progress}%` }} />
          </div>
        )}
        <p className="mt-1 text-muted-foreground text-xs tabular-nums">
          {goal.currentE1rm !== null ? `e1RM ${goal.currentE1rm}` : ""}
          {goal.currentE1rm !== null && target ? " · " : ""}
          {target ? `cel ${target}` : ""}
        </p>
      </div>
      {goals.length > 1 && (
        <div className="mt-2 flex gap-1">
          {goals.map((g, i) => (
            <span
              key={g.id}
              className={`h-1 w-3 rounded-full transition-colors ${
                i === index % goals.length ? "bg-primary" : "bg-muted"
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
          {prs.map((pr) => (
            <li key={pr.exerciseId} className="flex items-baseline justify-between gap-2 py-0.5 text-xs">
              <span className="truncate">{pr.namePl}</span>
              <span className="font-black text-primary tabular-nums">
                {pr.best ? (pr.best.e1rm ?? `${pr.best.reps}×${pr.best.weightKg}`) : "—"}
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
                {pr.best ? (pr.best.e1rm ?? `${pr.best.reps}×${pr.best.weightKg}`) : "—"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">e1RM · kg</p>
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
  const rows = sessions.filter((s) => s.endedAt !== null).slice(0, 4);
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
        <p className="text-muted-foreground text-sm">Jeszcze brak zakończonych sesji.</p>
      ) : (
        <ul>
          {rows.map((s) => {
            const top = s.exercises.find((e) => e.weightKg !== null || e.reps !== null);
            return (
              <li key={s.id}>
                <Link
                  to="/sessions/$sessionId"
                  params={{ sessionId: s.id }}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {s.title ?? SESSION_TYPE_LABEL_PL[s.type as SessionType] ?? s.type}
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

export function WeekTile({ plan }: { plan: DashboardData["plan"] }) {
  const today = warsawWeekday();
  return (
    <Link to="/plan" className={`${TILE_CLASS} ${TILE_INTERACTIVE_CLASS}`}>
      <TileHeader icon={CalendarDays} title="Tydzień" action="plan →" />
      {plan.length === 0 ? (
        <p className="text-muted-foreground text-sm">Ułóż plan tygodnia →</p>
      ) : (
        <ul className="space-y-1.5">
          {WEEKDAY_LABELS_PL.map((label, day) => {
            const entry = plan.find((d) => d.dayOfWeek === day);
            const isToday = day === today;
            return (
              <li
                key={label}
                className={`flex items-center gap-2 text-xs ${
                  isToday ? "font-bold text-foreground" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${entry ? PLAN_INTENSITY_DOT[entry.intensity] : "bg-muted"}`}
                />
                <span className="w-8 shrink-0">{label}</span>
                <span className="truncate">{entry ? (planTrainingLabel(entry)?.split("\n")[0] ?? "—") : "—"}</span>
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
