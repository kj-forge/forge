import { Link } from "@tanstack/react-router";

import { Card, CardContent } from "@/components/ui/card";
import { SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import type { SessionType } from "@/features/strength/types";
import { StatusBadge } from "@/shared/components/StatusBadge";

interface SessionListItemProps {
  session: {
    id: string;
    date: string | Date;
    type: string;
    endedAt: Date | null;
  };
  dateFormat?: "short" | "long";
}

export function SessionListItem({ session, dateFormat = "long" }: SessionListItemProps) {
  const label = SESSION_TYPE_LABEL_PL[session.type as SessionType] ?? session.type;

  return (
    <li>
      <Link to="/sessions/$sessionId" params={{ sessionId: session.id }} className="block">
        <Card className="transition-colors hover:bg-accent/50">
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0 space-y-1">
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
            </div>
            <span className="text-muted-foreground text-xs">→</span>
          </CardContent>
        </Card>
      </Link>
    </li>
  );
}
