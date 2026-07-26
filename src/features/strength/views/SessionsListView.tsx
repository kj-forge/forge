import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { SessionListItem } from "@/features/strength/components/SessionListItem";
import { SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import { historyQueryOptions } from "@/features/strength/lib/history-query";
import type { SessionType } from "@/features/strength/types";
import { InfiniteScrollList } from "@/shared/components/InfiniteScrollList";

const route = getRouteApi("/_shell/sessions/");

const MONTH_FMT = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" });

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 pt-1 font-bold text-[10.5px] text-muted-foreground uppercase tracking-widest">{children}</p>
  );
}

export function SessionsListView() {
  const { typ } = route.useSearch();
  const navigate = route.useNavigate();
  // Page zero is SSR'd by the route loader (ensureQueryData) and dehydrated —
  // this suspense query starts warm; scrolling appends pages into the cache.
  const query = useSuspenseInfiniteQuery(historyQueryOptions(typ));

  // Flatten pages, dedupe by id: a session logged mid-scroll shifts offsets
  // and would otherwise duplicate at a page seam.
  const seen = new Set<string>();
  const feed = [];
  for (const page of query.data.pages) {
    for (const s of page.sessions) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      feed.push(s);
    }
  }

  // Chips list every type the athlete EVER logged (server-side DISTINCT on
  // page zero) — not just the types visible in loaded pages.
  const presentTypes = (query.data.pages[0]?.types ?? []) as SessionType[];

  // Month groups in feed order — pages arrive date-desc, so the Map keeps
  // newest months first.
  const byMonth = new Map<string, typeof feed>();
  for (const s of feed) {
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

      {feed.length === 0 ? (
        typ ? (
          <p className="py-6 text-center text-muted-foreground text-sm">Brak sesji tego typu.</p>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground text-sm">
              <BookOpen className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
              Jeszcze brak sesji.
            </CardContent>
          </Card>
        )
      ) : (
        <InfiniteScrollList query={query} className="flex flex-col gap-3">
          {[...byMonth.entries()].map(([month, rows]) => (
            <section key={month} className="flex flex-col gap-2">
              <SectionHeader>
                {MONTH_FMT.format(new Date(`${month}-01T00:00:00Z`))} · {rows.length}{" "}
                {rows.length === 1 ? "sesja" : "sesji"}
              </SectionHeader>
              <ul className="space-y-2">
                {rows.map((s) => (
                  <SessionListItem key={s.id} session={s} detail="top-sets" />
                ))}
              </ul>
            </section>
          ))}
        </InfiniteScrollList>
      )}
    </main>
  );
}
