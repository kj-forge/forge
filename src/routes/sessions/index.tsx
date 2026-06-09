import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getSession } from "@/lib/session";
import { listRecentSessions } from "@/lib/strength";

export const Route = createFileRoute("/sessions/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: () => listRecentSessions(),
  component: SessionsListPage,
});

const SESSION_TYPE_LABEL_PL: Record<string, string> = {
  STRENGTH: "Siła",
  HYROX_EMOM: "Hyrox EMOM",
  HYROX_AMRAP: "Hyrox AMRAP",
  HYROX_WORK: "Hyrox WORK",
  CARDIO: "Cardio",
  COMPROMISED_RUN: "Compromised run",
  REHAB: "Rehab",
  MOBILITY: "Mobility",
};

function SessionsListPage() {
  const sessionsList = Route.useLoaderData();

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between pt-2">
        <Link to="/" className="text-muted-foreground text-sm">
          ← Wróć
        </Link>
      </header>

      <h1 className="font-bold text-2xl tracking-tight">Historia sesji</h1>

      {sessionsList.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">Jeszcze brak sesji.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {sessionsList.map((s) => (
            <li key={s.id}>
              <Link to="/sessions/$sessionId" params={{ sessionId: s.id }}>
                <Card className="transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{SESSION_TYPE_LABEL_PL[s.type] ?? s.type}</p>
                        <StatusBadge endedAt={s.endedAt} />
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {new Date(s.date).toLocaleDateString("pl-PL", {
                          weekday: "long",
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
          ))}
        </ul>
      )}
    </main>
  );
}
