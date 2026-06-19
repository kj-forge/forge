import { getRouteApi, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionListItem } from "@/features/strength/components/SessionListItem";
import { SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import type { SessionType } from "@/features/strength/types";

const route = getRouteApi("/");

export function HomeView() {
  const { session } = route.useRouteContext();
  const recentSessions = route.useLoaderData();

  const firstName = session.user.name?.split(" ")[0] ?? "athleto";
  const lastSession = recentSessions[0];

  // In-progress sessions first (their badge marks them), then most recent.
  // Capped at 4 — the dashboard is a glance, full list lives in history.
  const visibleSessions = [
    ...recentSessions.filter((s) => s.endedAt === null),
    ...recentSessions.filter((s) => s.endedAt !== null),
  ].slice(0, 4);

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
                Ostatni: <strong>{SESSION_TYPE_LABEL_PL[lastSession.type as SessionType] ?? lastSession.type}</strong> ·{" "}
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
          {recentSessions.some((s) => s.endedAt !== null) && (
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
            {visibleSessions.map((s) => (
              <SessionListItem key={s.id} session={s} dateFormat="short" detail="top-sets" />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
