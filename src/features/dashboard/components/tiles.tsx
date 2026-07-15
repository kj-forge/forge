import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ChartNoAxesColumn,
  Clock,
  Flag,
  type LucideIcon,
  Table2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import type { ReactNode } from "react";

import type { DashboardData, Trend } from "@/features/dashboard/server/dashboard";
import { goalProgress } from "@/features/goals/lib/goal-progress";
import { PLAN_INTENSITY_CLASS, PLAN_INTENSITY_DOT, PLAN_INTENSITY_LABEL } from "@/features/plan/constants";
import { SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import { formatSet } from "@/features/strength/lib/format-set";
import type { SessionType } from "@/features/strength/types";
import { WEEKDAY_FULL_PL, WEEKDAY_LABELS_PL, warsawWeekday } from "@/shared/lib/weekday";

const DATE_FMT = new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

export function Tile({
  icon: Icon,
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
    <section className={`min-w-0 rounded-2xl border bg-card p-4 ${className}`}>
      <div className="mb-2.5 flex items-center gap-1.5 font-bold text-[10.5px] text-muted-foreground uppercase tracking-widest">
        <Icon className="size-3.5 text-primary" />
        {title}
        {action && <span className="ml-auto font-medium normal-case tracking-normal">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function TileLink({ to, label }: { to: "/stats" | "/plan" | "/sessions" | "/me"; label: string }) {
  return (
    <Link to={to} className="text-muted-foreground text-xs transition-colors hover:text-foreground">
      {label} →
    </Link>
  );
}

export function TodayTile({ plan, className = "" }: { plan: DashboardData["plan"]; className?: string }) {
  const today = warsawWeekday();
  const entry = plan.find((d) => d.dayOfWeek === today);

  return (
    <section
      className={`min-w-0 rounded-2xl border border-primary/40 bg-linear-to-br from-primary/10 to-transparent p-4 ${className}`}
    >
      <Link to="/plan" className="block">
        <div className="mb-2.5 flex items-center gap-1.5 font-bold text-[10.5px] text-primary uppercase tracking-widest">
          <CalendarDays className="size-3.5" />
          Dziś wg planu
          <span className="ml-auto font-medium text-muted-foreground normal-case tracking-normal">plan →</span>
        </div>
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
            <p className="whitespace-pre-line text-sm leading-relaxed">{entry.training}</p>
            {entry.goal && <p className="mt-2 text-muted-foreground text-xs">Cel: {entry.goal}</p>}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            {plan.length === 0 ? "Ułóż plan tygodnia — Home podpowie, co dziś robisz." : "Brak planu na dziś."}
          </p>
        )}
      </Link>
    </section>
  );
}

export function LastSessionTile({ sessions }: { sessions: DashboardData["sessions"] }) {
  const active = sessions.find((s) => s.endedAt === null);
  const last = sessions.find((s) => s.endedAt !== null);

  if (active) {
    return (
      <Tile icon={Clock} title="Aktywna sesja">
        <Link
          to="/sessions/$sessionId"
          params={{ sessionId: active.id }}
          className="flex flex-col gap-1 font-semibold text-sm"
        >
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
            {SESSION_TYPE_LABEL_PL[active.type as SessionType] ?? active.type}
          </span>
          <span className="font-black text-base text-primary">Wróć do sesji →</span>
        </Link>
      </Tile>
    );
  }

  const top = last?.exercises.find((e) => e.weightKg !== null || e.reps !== null);
  return (
    <Tile icon={Clock} title="Ostatnia sesja">
      {last ? (
        <Link to="/sessions/$sessionId" params={{ sessionId: last.id }} className="block">
          <p className="font-semibold text-sm">{SESSION_TYPE_LABEL_PL[last.type as SessionType] ?? last.type}</p>
          <p className="text-muted-foreground text-xs">{DATE_FMT.format(new Date(last.date))}</p>
          {top && (
            <p className="mt-2 font-black text-base text-primary tabular-nums">
              {formatSet(top)}
              <span className="ml-1.5 font-normal text-muted-foreground text-xs">{top.name}</span>
            </p>
          )}
        </Link>
      ) : (
        <p className="text-muted-foreground text-sm">Jeszcze brak sesji.</p>
      )}
    </Tile>
  );
}

export function GoalTile({ goal, compact = false }: { goal: DashboardData["goal"]; compact?: boolean }) {
  if (!goal) {
    return (
      <Tile icon={Flag} title="Cel">
        <Link to="/me" className="block text-muted-foreground text-sm transition-colors hover:text-foreground">
          Ustaw cel →
        </Link>
      </Tile>
    );
  }

  const progress = goalProgress(goal.targetValue, goal.currentE1rm);
  return (
    <Tile icon={Flag} title="Cel" action={compact ? undefined : <TileLink to="/me" label="cele" />}>
      <Link to="/me" className="block">
        <p className={`truncate font-black text-primary tabular-nums ${compact ? "text-base" : "text-xl"}`}>
          {goal.title}
        </p>
        {progress !== null && (
          <div className="my-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-ember" style={{ width: `${progress}%` }} />
          </div>
        )}
        <p className="text-muted-foreground text-xs tabular-nums">
          {goal.currentE1rm !== null ? `e1RM ${goal.currentE1rm}` : ""}
          {goal.currentE1rm !== null && goal.targetValue != null ? " · " : ""}
          {goal.targetValue != null ? `cel ${goal.targetValue} ${goal.targetUnit ?? ""}` : ""}
        </p>
      </Link>
    </Tile>
  );
}

export function PrTile({ prs, compact = false }: { prs: DashboardData["prs"]; compact?: boolean }) {
  return (
    <Tile icon={Trophy} title="Rekordy" action={compact ? undefined : <TileLink to="/stats" label="statystyki" />}>
      <Link to="/stats" className="block">
        <ul className={compact ? "space-y-0.5" : "divide-y"}>
          {prs.map((pr) => (
            <li
              key={pr.exerciseId}
              className={`flex items-baseline justify-between gap-2 ${compact ? "text-xs" : "py-1.5 text-sm"}`}
            >
              <span className="truncate">{pr.namePl}</span>
              <span className="font-black text-primary tabular-nums">
                {pr.best ? (pr.best.e1rm ?? `${pr.best.reps}×${pr.best.weightKg}`) : "—"}
              </span>
            </li>
          ))}
        </ul>
        {!compact && <p className="mt-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">e1RM · kg</p>}
      </Link>
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
      action={<TileLink to="/sessions" label="historia" />}
      className={className}
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Jeszcze brak zakończonych sesji.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((s) => {
            const top = s.exercises.find((e) => e.weightKg !== null || e.reps !== null);
            return (
              <li key={s.id}>
                <Link
                  to="/sessions/$sessionId"
                  params={{ sessionId: s.id }}
                  className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-accent"
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
    <Tile icon={CalendarDays} title="Tydzień" action={<TileLink to="/plan" label="plan" />}>
      {plan.length === 0 ? (
        <Link to="/plan" className="block text-muted-foreground text-sm transition-colors hover:text-foreground">
          Ułóż plan tygodnia →
        </Link>
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
                <span className="truncate">{entry ? entry.training.split("\n")[0] : "—"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Tile>
  );
}

export function TrendTile({ trend, className = "" }: { trend: Trend; className?: string }) {
  const values = trend.points.map((p) => p.e1rm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const width = 600;
  const height = 64;
  const pad = 8;
  const step = trend.points.length > 1 ? (width - pad * 2) / (trend.points.length - 1) : 0;
  const coords = trend.points.map((p, i) => ({
    x: pad + i * step,
    y: height - pad - ((p.e1rm - min) / spread) * (height - pad * 2),
  }));
  const first = trend.points[0];
  const last = trend.points[trend.points.length - 1];
  const shortDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  return (
    <Tile
      icon={TrendingUp}
      title={`${trend.namePl} — trend e1RM`}
      action={<TileLink to="/stats" label="statystyki" />}
      className={className}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-16 w-full"
        role="img"
        aria-label={`Trend e1RM: ${trend.namePl}`}
      >
        <defs>
          <linearGradient id="trend-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--primary)" stopOpacity="0.45" />
            <stop offset="1" stopColor="var(--primary)" />
          </linearGradient>
        </defs>
        <polyline
          points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
          fill="none"
          stroke="url(#trend-stroke)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="3.5" fill="var(--primary)" />
      </svg>
      <div className="flex justify-between text-[10.5px] text-muted-foreground tabular-nums">
        <span>
          {shortDate(first.date)} · {first.e1rm}
        </span>
        <span>
          {shortDate(last.date)} · <b className="text-primary">{last.e1rm}</b>
        </span>
      </div>
    </Tile>
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
