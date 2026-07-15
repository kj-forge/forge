import { getRouteApi } from "@tanstack/react-router";
import { Table2, Trophy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { LOADED_BW_SLUGS } from "@/features/strength/constants";
import { type CompactSetsPart, formatSetsCompactParts } from "@/features/strength/lib/format-sets-compact";
import type { PrTableRow, WeekdaySession } from "@/features/strength/server/stats";
import { WEEKDAY_LABELS_PL } from "@/shared/lib/weekday";

const route = getRouteApi("/_shell/stats/");

const ACC_STORAGE_KEY = "forge-stats-acc";

const PR_DATE_FMT = new Intl.DateTimeFormat("pl-PL", {
  weekday: "short",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function formatColumnDate(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isLoadedBw(slug: string): boolean {
  return (LOADED_BW_SLUGS as readonly string[]).includes(slug);
}

export function StatsView() {
  const data = route.useLoaderData();
  const search = route.useSearch();
  const navigate = route.useNavigate();

  // The toggle's remembered default: opening /stats with a bare URL restores
  // the last choice. Applied after mount (localStorage is client-only), as a
  // replace so back doesn't bounce through the un-toggled URL.
  useEffect(() => {
    if (data.seg === "rekordy" && search.acc === undefined && localStorage.getItem(ACC_STORAGE_KEY) === "1") {
      navigate({ search: (prev) => ({ ...prev, acc: 1 }), replace: true });
    }
  }, [data.seg, search.acc, navigate]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <h1 className="pt-2 font-bold text-2xl tracking-tight">Statystyki</h1>

      <div className="grid grid-cols-2 gap-1.5">
        {(["rekordy", "zestawienia"] as const).map((seg) => (
          <button
            key={seg}
            type="button"
            className={`rounded-md border px-2 py-2 font-semibold text-sm capitalize transition-colors ${
              data.seg === seg ? "border-transparent bg-ember" : "border-border text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => navigate({ search: (prev) => ({ ...prev, seg }) })}
          >
            {seg}
          </button>
        ))}
      </div>

      {data.seg === "rekordy" ? (
        <RekordySegment
          prTable={data.prTable}
          accOn={search.acc === 1}
          onToggleAcc={(on) => {
            localStorage.setItem(ACC_STORAGE_KEY, on ? "1" : "0");
            navigate({ search: (prev) => ({ ...prev, acc: on ? 1 : undefined }), replace: true });
          }}
        />
      ) : (
        <ZestawieniaSegment
          weekday={data.weekday}
          days={data.days}
          onPickDay={(dzien) => navigate({ search: (prev) => ({ ...prev, dzien }) })}
        />
      )}
    </main>
  );
}

function RekordySegment({
  prTable,
  accOn,
  onToggleAcc,
}: {
  prTable: PrTableRow[];
  accOn: boolean;
  onToggleAcc: (on: boolean) => void;
}) {
  const mains = prTable.filter((r) => r.isMainLift);
  const accessories = prTable.filter((r) => !r.isMainLift);
  const hasAnyBest = prTable.some((r) => r.best !== null);

  return (
    <section className="flex flex-col gap-3">
      {!hasAnyBest && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground text-sm">
            <Trophy className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
            Brak zapisanych serii — rekordy pojawią się po pierwszej zakończonej sesji siłowej.
          </CardContent>
        </Card>
      )}

      <ul className="divide-y rounded-xl border bg-card">
        {mains.map((row) => (
          <PrRow key={row.exerciseId} row={row} />
        ))}
      </ul>

      <button
        type="button"
        aria-pressed={accOn}
        className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-muted-foreground text-sm transition-colors hover:bg-accent"
        onClick={() => onToggleAcc(!accOn)}
      >
        <span>Akcesoria (RDL, bułgary, drążek, dipy)</span>
        <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${accOn ? "bg-ember" : "bg-muted"}`}>
          {/* Explicit left anchor: without it the absolute thumb takes its
              static position, and the button's default text-align:center
              starts it mid-track — ON then overshoots the pill. */}
          <span
            className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${
              accOn ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </span>
      </button>

      {accOn && accessories.length > 0 && (
        <>
          <p className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">Akcesoria</p>
          <ul className="divide-y rounded-xl border bg-card">
            {accessories.map((row) => (
              <PrRow key={row.exerciseId} row={row} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function PrRow({ row }: { row: PrTableRow }) {
  const best = row.best;
  const weightLabel = best ? (isLoadedBw(row.slug) ? `+${best.weightKg}` : `${best.weightKg}`) : null;

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-semibold text-sm">{row.namePl}</p>
        <p className="text-muted-foreground text-xs">
          {best ? PR_DATE_FMT.format(new Date(best.date)) : "brak danych"}
        </p>
      </div>
      {best && (
        <div className="shrink-0 text-right">
          <p className="font-black text-base text-primary tabular-nums">
            {best.reps}× {weightLabel} kg
          </p>
          <p className="text-muted-foreground text-xs tabular-nums">
            e1RM {best.e1rm !== null ? `~${best.e1rm} kg` : "—"}
          </p>
        </div>
      )}
    </li>
  );
}

function ZestawieniaSegment({
  weekday,
  days,
  onPickDay,
}: {
  weekday: number;
  days: WeekdaySession[];
  onPickDay: (dzien: number) => void;
}) {
  // Sessions arrive newest first; the matrix reads left→right through time,
  // so columns are reversed and the scroll starts snapped to the newest.
  const columns = [...days].reverse();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Scroll affordance: snapping to the newest column hides older sessions
  // behind the sticky exercise column with nothing hinting they exist, so
  // track both overflow directions and surface them visually below.
  const [hiddenLeft, setHiddenLeft] = useState(false);
  const [hiddenRight, setHiddenRight] = useState(false);
  const updateOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHiddenLeft(el.scrollLeft > 4);
    setHiddenRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
    updateOverflow();
    window.addEventListener("resize", updateOverflow);
    return () => window.removeEventListener("resize", updateOverflow);
  }, [updateOverflow]);

  // Row order: first appearance scanning from the NEWEST session, so the
  // current plan's exercises sit on top and dropped ones sink to the bottom.
  const rowDefs: { slug: string; namePl: string }[] = [];
  const seen = new Set<string>();
  for (const day of days) {
    for (const ex of day.exercises) {
      if (seen.has(ex.slug)) continue;
      seen.add(ex.slug);
      rowDefs.push({ slug: ex.slug, namePl: ex.namePl });
    }
  }

  const cellParts = (session: WeekdaySession, slug: string): CompactSetsPart[] => {
    const sets = session.exercises.filter((e) => e.slug === slug).flatMap((e) => e.sets);
    return formatSetsCompactParts(sets, { loadedBodyweight: isLoadedBw(slug) });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS_PL.map((label, i) => (
          <button
            key={label}
            type="button"
            className={`rounded-md border px-0 py-1.5 font-semibold text-xs transition-colors ${
              weekday === i ? "border-transparent bg-ember" : "border-border text-muted-foreground hover:bg-accent"
            }`}
            onClick={() => onPickDay(i)}
          >
            {label}
          </button>
        ))}
      </div>

      {days.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground text-sm">
            <Table2 className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
            Brak treningów z tego dnia w ostatnich 2 miesiącach.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="relative">
            <div ref={scrollRef} className="overflow-x-auto rounded-xl border bg-card" onScroll={updateOverflow}>
              <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th
                      className={`sticky left-0 z-10 border-b bg-card px-3 py-2 text-left font-medium text-muted-foreground text-xs transition-shadow ${
                        hiddenLeft ? "shadow-[6px_0_8px_-4px_rgba(0,0,0,0.35)]" : ""
                      }`}
                    >
                      Ćwiczenie
                    </th>
                    {columns.map((c, i) => (
                      <th
                        key={c.sessionId}
                        className={`border-b px-3 py-2 text-right font-semibold text-xs ${
                          i === columns.length - 1 ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {formatColumnDate(c.date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowDefs.map((row, rowIdx) => (
                    <tr key={row.slug}>
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 bg-card px-3 py-2.5 text-left font-medium text-sm ${
                          rowIdx === rowDefs.length - 1 ? "" : "border-b"
                        }`}
                      >
                        {row.namePl}
                      </th>
                      {columns.map((c, i) => (
                        <td
                          key={c.sessionId}
                          className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${
                            rowIdx === rowDefs.length - 1 ? "" : "border-b"
                          }`}
                        >
                          <MatrixCell parts={cellParts(c, row.slug)} newest={i === columns.length - 1} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hiddenRight && (
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-linear-to-l from-card to-transparent" />
            )}
          </div>
          <p className="text-center text-muted-foreground text-xs">
            {hiddenLeft && (
              <span className="font-medium text-foreground">← przesuń — starsze treningi po lewej · </span>
            )}
            Zakres: ostatnie 2 miesiące · „—" = ćwiczenie nie wystąpiło w tej sesji
          </p>
        </>
      )}
    </section>
  );
}

function MatrixCell({ parts, newest }: { parts: CompactSetsPart[]; newest: boolean }) {
  if (parts.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      {parts.map((p, i) => (
        <span key={`${p.weight}-${p.reps}`}>
          {i > 0 && <span className="text-muted-foreground"> · </span>}
          {p.weight !== null && <b className={`font-semibold ${newest ? "text-primary" : ""}`}>{p.weight} </b>}
          <span className={p.weight === null && newest ? "text-primary" : ""}>{p.reps}</span>
        </span>
      ))}
    </>
  );
}
