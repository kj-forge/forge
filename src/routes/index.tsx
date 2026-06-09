import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/session";
import { listRecentSessions } from "@/lib/strength";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  loader: () => listRecentSessions(),
  component: HomePage,
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

function HomePage() {
  const { session } = Route.useRouteContext();
  const recentSessions = Route.useLoaderData();

  const firstName = session.user.name?.split(" ")[0] ?? "athleto";
  const lastSession = recentSessions[0];

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 p-4">
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-muted-foreground text-sm">Cześć,</p>
          <h1 className="font-bold text-2xl tracking-tight">{firstName} 👋</h1>
        </div>
        <Link to="/me" className="text-muted-foreground text-sm underline-offset-4 hover:underline">
          Konto
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>🏋️ Czas na trening?</CardTitle>
          <CardDescription>
            {lastSession ? (
              <>
                Ostatni: <strong>{SESSION_TYPE_LABEL_PL[lastSession.type] ?? lastSession.type}</strong> ·{" "}
                {new Date(lastSession.date).toLocaleDateString("pl-PL", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </>
            ) : (
              <>To Twój pierwszy trening w Forge. Lecimy!</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/sessions/new" search={{ type: "STRENGTH" }}>
            <Button size="lg" className="w-full">
              + Rozpocznij sesję siłową
            </Button>
          </Link>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-medium text-sm">Ostatnie sesje</h2>
          {recentSessions.length > 0 && (
            <Link to="/sessions" className="text-muted-foreground text-xs underline-offset-4 hover:underline">
              Zobacz wszystkie →
            </Link>
          )}
        </div>

        {recentSessions.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground text-sm">Jeszcze brak sesji.</CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {recentSessions.slice(0, 5).map((s) => (
              <li key={s.id}>
                <Link to="/sessions/$sessionId" params={{ sessionId: s.id }} className="block">
                  <Card className="transition-colors hover:bg-accent/50">
                    <CardContent className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{SESSION_TYPE_LABEL_PL[s.type] ?? s.type}</p>
                          <StatusBadge endedAt={s.endedAt} />
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {new Date(s.date).toLocaleDateString("pl-PL", {
                            weekday: "short",
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
      </section>
    </main>
  );
}
