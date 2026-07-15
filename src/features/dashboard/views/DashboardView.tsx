import { getRouteApi, Link } from "@tanstack/react-router";

import { TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GhostTile, OnboardingTiles } from "@/features/dashboard/components/onboarding";
import {
  GoalTile,
  LastSessionTile,
  PrTile,
  SessionsTile,
  TodayTile,
  TrendTile,
  WeekTile,
  ZestawieniaTile,
} from "@/features/dashboard/components/tiles";
import { TodayPlanCard } from "@/features/plan/components/TodayPlanCard";
import { SessionListItem } from "@/features/strength/components/SessionListItem";

const route = getRouteApi("/_shell/");

export function DashboardView() {
  const { session } = route.useRouteContext();
  const data = route.useLoaderData();
  const firstName = session.user.name?.split(" ")[0] ?? "athleto";
  const firstRun = data.sessions.length === 0;

  // In-progress sessions first (their badge marks them), then most recent.
  const visibleSessions = [
    ...data.sessions.filter((s) => s.endedAt === null),
    ...data.sessions.filter((s) => s.endedAt !== null),
  ].slice(0, 4);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4 lg:max-w-6xl">
      <header className="flex items-end justify-between gap-4 pt-2">
        <div>
          <p className="text-muted-foreground text-sm">Cześć,</p>
          <h1 className="font-bold text-2xl tracking-tight">{firstName} 👋</h1>
          {firstRun && (
            <p className="mt-1 text-muted-foreground text-sm">Witaj w Forge — trzy kroki i dziennik żyje.</p>
          )}
        </div>
        <Link to="/sessions/new" search={{ type: "STRENGTH" }} className="hidden lg:block">
          <Button className="bg-ember shadow-ember">+ Rozpocznij sesję</Button>
        </Link>
      </header>

      {/* Mobile: trimmed bento — today, CTA, mini row, sessions. */}
      <div className="flex flex-col gap-4 lg:hidden">
        <TodayPlanCard plan={data.plan} />
        <Link to="/sessions/new" search={{ type: "STRENGTH" }}>
          <Button size="lg" className="w-full bg-ember shadow-ember">
            + Rozpocznij sesję siłową
          </Button>
        </Link>
        <div className="grid grid-cols-2 items-start gap-3">
          <GoalTile goals={data.goals} compact />
          <PrTile prs={data.prs} compact />
        </div>
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-medium text-sm">Ostatnie sesje</h2>
            {data.sessions.some((s) => s.endedAt !== null) && (
              <Link to="/sessions" className="font-semibold text-primary text-xs underline-offset-4 hover:underline">
                Zobacz wszystkie →
              </Link>
            )}
          </div>
          {data.sessions.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground text-sm">Jeszcze brak sesji.</p>
          ) : (
            <ul className="space-y-2">
              {visibleSessions.map((s) => (
                <SessionListItem key={s.id} session={s} dateFormat="short" detail="top-sets" />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Desktop: full bento, or the 1-2-3 start path before any session. */}
      {firstRun ? (
        <OnboardingTiles data={data} />
      ) : (
        <div className="hidden gap-4 lg:grid lg:grid-cols-4">
          <TodayTile plan={data.plan} className="lg:col-span-2" />
          <LastSessionTile sessions={data.sessions} />
          <GoalTile goals={data.goals} />
          <PrTile prs={data.prs} />
          <SessionsTile sessions={data.sessions} className="lg:col-span-2" />
          <WeekTile plan={data.plan} />
          {data.trend ? (
            <TrendTile trend={data.trend} className="lg:col-span-3" />
          ) : (
            <GhostTile
              icon={TrendingUp}
              title="Trend e1RM"
              text="wykres pojawi się po dwóch zakończonych sesjach z bojem głównym"
              className="lg:col-span-3"
            />
          )}
          <ZestawieniaTile counts={data.weekdayCounts} />
        </div>
      )}
    </main>
  );
}
