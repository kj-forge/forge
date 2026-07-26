import { Link } from "@tanstack/react-router";

import { ChevronRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import { formatRoundsCount, formatSeriesCount, formatWeight } from "@/features/strength/lib/format-set";
import type { SessionType } from "@/features/strength/types";
import { StatusBadge } from "@/shared/components/StatusBadge";

interface SessionExercise {
  name: string;
  weightKg: number | null;
  reps: number | null;
  setCount: number;
}

interface SessionListItemProps {
  session: {
    id: string;
    date: string | Date;
    type: string;
    title?: string | null;
    endedAt: Date | null;
    durationMin?: number | null;
    roundsCount?: number;
    exercises?: SessionExercise[];
  };
  // none: just type + metrics. top-sets: per-exercise heaviest-set list
  // (capped), used by both dashboard and history now.
  detail?: "none" | "top-sets";
}

const TOP_SETS_SHOWN = 3;

export function SessionListItem({ session, detail = "none" }: SessionListItemProps) {
  const label = SESSION_TYPE_LABEL_PL[session.type as SessionType] ?? session.type;
  const exercises = session.exercises ?? [];
  const isLive = session.endedAt === null;

  // Headline is an explicit session title if set, else the day's first
  // exercise; extraCount is how many more exercises hide behind the "+N".
  const hasTitle = session.title != null && session.title !== "";
  const headline = hasTitle ? session.title : exercises[0]?.name;
  const extraCount = hasTitle ? exercises.length : Math.max(0, exercises.length - 1);

  const totalSets = exercises.reduce((sum, e) => sum + e.setCount, 0);
  const countLabel =
    session.type === "HYROX" && (session.roundsCount ?? 0) > 0
      ? formatRoundsCount(session.roundsCount ?? 0)
      : totalSets > 0
        ? formatSeriesCount(totalSets)
        : "";

  const date = new Date(session.date);
  const weekdayShort = date.toLocaleDateString("pl-PL", { weekday: "short" }).replace(/\.$/, "");
  const dayOfMonth = date.getDate();

  return (
    <li>
      <Link to="/sessions/$sessionId" params={{ sessionId: session.id }} className="block">
        <Card className={`transition-colors hover:bg-accent/50 ${isLive ? "ring-primary/50" : ""}`}>
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 shrink-0 text-center">
                <p className="font-extrabold text-[10px] text-muted-foreground uppercase">{weekdayShort}</p>
                <p className="font-extrabold text-lg tabular-nums leading-tight">{dayOfMonth}</p>
              </div>
              <div className="w-px self-stretch bg-border" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-sm leading-tight">
                    {headline ?? label}
                    {extraCount > 0 && <span className="text-muted-foreground"> +{extraCount}</span>}
                  </p>
                  {isLive && <StatusBadge endedAt={null} />}
                </div>
                <p className="text-muted-foreground text-xs">
                  {label}
                  {countLabel ? ` · ${countLabel}` : ""}
                  {session.durationMin != null ? ` · ${session.durationMin} min` : ""}
                </p>

                {detail === "top-sets" && exercises.length > 0 && (
                  <ul className="space-y-0.5 pt-1">
                    {exercises.slice(0, TOP_SETS_SHOWN).map((e) => (
                      <li key={e.name} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate">
                          {e.name}
                          {e.setCount > 0 && (
                            <span className="text-muted-foreground"> · {formatSeriesCount(e.setCount)}</span>
                          )}
                        </span>
                        {e.reps !== null && (
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {e.reps}× <span className="font-bold text-primary">{formatWeight(e.weightKg)}</span>
                          </span>
                        )}
                      </li>
                    ))}
                    {exercises.length > TOP_SETS_SHOWN && (
                      <li className="text-muted-foreground text-xs">+{exercises.length - TOP_SETS_SHOWN} więcej</li>
                    )}
                  </ul>
                )}
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}
