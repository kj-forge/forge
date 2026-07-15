import { Link } from "@tanstack/react-router";
import { BookOpen, CalendarDays, Dumbbell, type LucideIcon, Target, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GoalTile, TodayTile, WeekTile } from "@/features/dashboard/components/tiles";
import type { DashboardData } from "@/features/dashboard/server/dashboard";

function StepTile({
  icon: Icon,
  title,
  text,
  children,
  className = "",
  accent = false,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border p-4 ${
        accent ? "border-primary/40 bg-linear-to-br from-primary/10 to-transparent" : "bg-card"
      } ${className}`}
    >
      <span className="mb-3 grid size-11 place-items-center rounded-xl bg-ember shadow-ember">
        <Icon className="size-5.5" />
      </span>
      <p className="mb-1 font-bold text-[10.5px] text-muted-foreground uppercase tracking-widest">{title}</p>
      <p className="mb-3 text-sm">{text}</p>
      {children}
    </section>
  );
}

export function GhostTile({
  icon: Icon,
  title,
  text,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  className?: string;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed p-4 text-center ${className}`}
    >
      <Icon className="mb-1 size-9 text-muted-foreground/50" strokeWidth={1.5} />
      <p className="font-bold text-[10.5px] text-muted-foreground uppercase tracking-widest">{title}</p>
      <p className="text-muted-foreground text-xs">{text}</p>
    </section>
  );
}

// First-run desktop bento: the grid becomes a 1-2-3 start path. Tiles come
// alive individually as their data arrives (plan → real today/week tile,
// goal → real goal tile); the whole thing disappears with the first session.
export function OnboardingTiles({ data }: { data: DashboardData }) {
  const hasPlan = data.plan.length > 0;

  return (
    <div className="hidden gap-4 lg:grid lg:grid-cols-4">
      <StepTile
        icon={Dumbbell}
        title="Krok 1 · Pierwsza sesja"
        text="Zaloguj pierwszy trening — rekordy i statystyki policzą się same."
        accent
        className="lg:col-span-2"
      >
        <Link to="/sessions/new" search={{ type: "STRENGTH" }}>
          <Button className="bg-ember shadow-ember">+ Rozpocznij sesję siłową</Button>
        </Link>
      </StepTile>

      {hasPlan ? (
        <TodayTile plan={data.plan} />
      ) : (
        <StepTile icon={CalendarDays} title="Krok 2 · Plan" text="Ułóż tydzień PON→ND — Home podpowie, co dziś robisz.">
          <Link to="/plan" className="font-bold text-primary text-sm">
            Uzupełnij tydzień →
          </Link>
        </StepTile>
      )}

      {data.goal ? (
        <GoalTile goal={data.goal} />
      ) : (
        <StepTile icon={Target} title="Krok 3 · Cel" text="Siła, czas wyścigu, sylwetka — wyznacz kierunek.">
          <Link to="/goals" className="font-bold text-primary text-sm">
            Ustaw cel →
          </Link>
        </StepTile>
      )}

      <GhostTile icon={Trophy} title="Rekordy" text="e1RM czterech bojów — po pierwszej sesji siłowej" />
      <GhostTile
        icon={BookOpen}
        title="Ostatnie sesje"
        text="historia treningów z top setami — patrz Krok 1"
        className="lg:col-span-2"
      />
      {hasPlan ? (
        <WeekTile plan={data.plan} />
      ) : (
        <GhostTile icon={CalendarDays} title="Tydzień" text="pigułka planu z intensywnościami dni" />
      )}
    </div>
  );
}
