import { Link } from "@tanstack/react-router";

import { Card, CardContent } from "@/components/ui/card";
import { SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import { formatWeight } from "@/features/strength/lib/format-set";
import type { SessionType } from "@/features/strength/types";
import { StatusBadge } from "@/shared/components/StatusBadge";

interface SessionExercise {
  name: string;
  weightKg: number | null;
  reps: number | null;
}

interface SessionListItemProps {
  session: {
    id: string;
    date: string | Date;
    type: string;
    endedAt: Date | null;
    exercises?: SessionExercise[];
  };
  dateFormat?: "short" | "long";
  // none: just type + date. names: one-line exercise list. top-sets: per-exercise
  // heaviest-set list (capped). Dashboard uses top-sets, history uses names.
  detail?: "none" | "names" | "top-sets";
}

const TOP_SETS_SHOWN = 3;

export function SessionListItem({ session, dateFormat = "long", detail = "none" }: SessionListItemProps) {
  const label = SESSION_TYPE_LABEL_PL[session.type as SessionType] ?? session.type;
  const exercises = session.exercises ?? [];

  return (
    <li>
      <Link to="/sessions/$sessionId" params={{ sessionId: session.id }} className="block">
        <Card className="transition-colors hover:bg-accent/50">
          <CardContent className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{label}</p>
                  <StatusBadge endedAt={session.endedAt} />
                </div>
                <p className="text-muted-foreground text-xs">
                  {new Date(session.date).toLocaleDateString("pl-PL", {
                    weekday: dateFormat,
                    day: "numeric",
                    month: "long",
                  })}
                </p>

                {detail === "names" && exercises.length > 0 && (
                  <p className="truncate text-muted-foreground text-xs">{exercises.map((e) => e.name).join(" · ")}</p>
                )}

                {detail === "top-sets" && exercises.length > 0 && (
                  <ul className="space-y-0.5 pt-1">
                    {exercises.slice(0, TOP_SETS_SHOWN).map((e) => (
                      <li key={e.name} className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate">{e.name}</span>
                        {e.reps !== null && (
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {e.reps}×<span className="font-medium text-foreground">{formatWeight(e.weightKg)}</span>
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
              <span className="shrink-0 text-muted-foreground text-xs">→</span>
            </div>
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}
