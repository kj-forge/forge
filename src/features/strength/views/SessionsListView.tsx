import { getRouteApi } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { SessionListItem } from "@/features/strength/components/SessionListItem";
import { SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import type { SessionType } from "@/features/strength/types";

const route = getRouteApi("/_shell/sessions/");

const MONTH_FMT = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" });

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 pt-1 font-bold text-[10.5px] text-muted-foreground uppercase tracking-widest">{children}</p>
  );
}

export function SessionsListView() {
  const sessionsList = route.useLoaderData();
  const { typ } = route.useSearch();
  const navigate = route.useNavigate();

  // Filter chips only make sense once the data actually has variety.
  const presentTypes = [...new Set(sessionsList.map((s) => s.type))] as SessionType[];
  const filtered = typ ? sessionsList.filter((s) => s.type === typ) : sessionsList;

  const active = filtered.filter((s) => s.endedAt === null);
  const ended = filtered.filter((s) => s.endedAt !== null);

  // Month groups in feed order — the list arrives date-desc, so the Map keeps
  // newest months first.
  const byMonth = new Map<string, typeof ended>();
  for (const s of ended) {
    const key = String(s.date).slice(0, 7);
    const arr = byMonth.get(key) ?? [];
    arr.push(s);
    byMonth.set(key, arr);
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="pt-2 font-bold text-2xl tracking-tight">Historia sesji</h1>

      {presentTypes.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[undefined, ...presentTypes].map((t) => (
            <button
              key={t ?? "all"}
              type="button"
              className={`rounded-md border px-2.5 py-1.5 font-semibold text-xs transition-colors ${
                typ === t ? "border-transparent bg-ember" : "border-border text-muted-foreground hover:bg-accent"
              }`}
              onClick={() => navigate({ search: { typ: t }, replace: true })}
            >
              {t ? SESSION_TYPE_LABEL_PL[t] : "Wszystkie"}
            </button>
          ))}
        </div>
      )}

      {sessionsList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground text-sm">
            <BookOpen className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
            Jeszcze brak sesji.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">Brak sesji tego typu.</p>
      ) : (
        <>
          {active.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader>W trakcie</SectionHeader>
              <ul className="space-y-2">
                {active.map((s) => (
                  <SessionListItem key={s.id} session={s} detail="names" />
                ))}
              </ul>
            </section>
          )}

          {[...byMonth.entries()].map(([month, rows]) => (
            <section key={month} className="flex flex-col gap-2">
              <SectionHeader>
                {MONTH_FMT.format(new Date(`${month}-01T00:00:00Z`))} · {rows.length}{" "}
                {rows.length === 1 ? "sesja" : "sesji"}
              </SectionHeader>
              <ul className="space-y-2">
                {rows.map((s) => (
                  <SessionListItem key={s.id} session={s} detail="names" />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
