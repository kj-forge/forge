import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Link, useRouter } from "@tanstack/react-router";
import { CheckCircle2, ChevronLeft, ChevronRight, Dumbbell, Moon, Plus, Sun, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DAY_SLOT_LABEL,
  DAY_SLOTS,
  type DaySlot,
  UNIT_INTENSITY_CLASS,
  UNIT_INTENSITY_LABEL,
} from "@/features/plan/constants";
import { unitTrainingLabel } from "@/features/plan/lib/plan-display";
import { type ScheduleEntry, warsawTodayIso } from "@/features/plan/lib/schedule";
import { moveScheduleEntry, removeScheduleEntry, setScheduleEntrySlot } from "@/features/plan/server/plan";
import type { WeekSchedule } from "@/features/plan/types";
import { SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import { getErrorMessage } from "@/lib/error-message";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { Spinner } from "@/shared/components/Spinner";
import { WEEKDAY_FULL_PL } from "@/shared/lib/weekday";

const DAY_FMT = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" });

// Stable per-entry drag id: a PLAN entry is unique by (unit, date), an
// override entry by its row id.
const entryDragId = (entry: ScheduleEntry) =>
  entry.source === "PLAN" ? `plan:${entry.unitId}:${entry.date}` : `override:${entry.overrideId}`;

interface ScheduleTabProps {
  schedule: WeekSchedule;
  hasAnyPlan: boolean;
  onShowPlans: () => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onAddToDay: (date: string, dayOfWeek: number) => void;
  onEditEntry: (entry: ScheduleEntry) => void;
}

export function ScheduleTab({
  schedule,
  hasAnyPlan,
  onShowPlans,
  onPrevWeek,
  onNextWeek,
  onToday,
  onAddToDay,
  onEditEntry,
}: ScheduleTabProps) {
  const router = useRouter();
  const today = warsawTodayIso();
  const [dragged, setDragged] = useState<ScheduleEntry | null>(null);
  const [action, setAction] = useState<ScheduleEntry | null>(null);
  // Optimistic layer: a drop re-renders the entry on its target day
  // immediately; the pending record is reconciled away only once the loader
  // data reflects the write (clearing on invalidate() resolve is too early —
  // it settles before the fresh data commits, which reads as a bounce), or
  // dropped in catch (snap back + toast).
  const [pendingMoves, setPendingMoves] = useState<ReadonlyMap<string, string>>(new Map());
  const [pendingRemovals, setPendingRemovals] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    setPendingMoves((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      for (const [key, toDate] of prev) {
        // Satisfied when no entry still renders under this key at a date
        // other than the target (a moved PLAN entry disappears entirely; a
        // moved override reappears already re-dated).
        const stillAtSource = schedule.entries.some((e) => entryDragId(e) === key && e.date !== toDate);
        if (!stillAtSource) next.delete(key);
      }
      return next.size === prev.size ? prev : next;
    });
    setPendingRemovals((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const key of prev) {
        if (!schedule.entries.some((e) => entryDragId(e) === key)) next.delete(key);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [schedule.entries]);

  // Drag stays a desktop affordance; on touch the tap → action sheet covers
  // moving between days and slots.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }));

  const entriesByDate = new Map<string, ScheduleEntry[]>();
  for (const entry of schedule.entries) {
    const key = entryDragId(entry);
    if (pendingRemovals.has(key)) continue;
    const date = pendingMoves.get(key) ?? entry.date;
    const arr = entriesByDate.get(date) ?? [];
    arr.push(date === entry.date ? entry : { ...entry, date });
    entriesByDate.set(date, arr);
  }
  const sessionsByDate = new Map<string, WeekSchedule["sessions"]>();
  for (const s of schedule.sessions) {
    const arr = sessionsByDate.get(s.date) ?? [];
    arr.push(s);
    sessionsByDate.set(s.date, arr);
  }
  const pendingWrite = pendingMoves.size > 0 || pendingRemovals.size > 0;

  const move = async (entry: ScheduleEntry, toDate: string) => {
    const key = entryDragId(entry);
    // entry.date may already be optimistic (rapid re-drag); the server call
    // must use the PERSISTED origin, so ignore drags while one is in flight.
    if (toDate === entry.date || pendingMoves.has(key)) return;
    setPendingMoves((prev) => new Map(prev).set(key, toDate));
    try {
      await moveScheduleEntry({
        data:
          entry.source === "PLAN"
            ? { kind: "PLAN", unitId: entry.unitId as string, fromDate: entry.date, toDate, slot: entry.slot }
            : { kind: "OVERRIDE", overrideId: entry.overrideId as string, toDate },
      });
      // Success path leaves the record alone — the reconcile effect drops it
      // once the reloaded data shows the move, so there's no stale-data gap.
      await router.invalidate();
    } catch (err) {
      toast.error(getErrorMessage(err, "Nie udało się przenieść treningu."));
      setPendingMoves((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const remove = async (entry: ScheduleEntry) => {
    const key = entryDragId(entry);
    setPendingRemovals((prev) => new Set(prev).add(key));
    try {
      await removeScheduleEntry({
        data:
          entry.source === "PLAN"
            ? { date: entry.date, unitId: entry.unitId as string }
            : { overrideId: entry.overrideId as string },
      });
      await router.invalidate();
    } catch (err) {
      toast.error(getErrorMessage(err, "Nie udało się usunąć treningu."));
      setPendingRemovals((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    setDragged((event.active.data.current as { entry: ScheduleEntry } | undefined)?.entry ?? null);
  };
  const onDragEnd = (event: DragEndEvent) => {
    const entry = dragged;
    setDragged(null);
    const over = event.over?.id;
    if (entry && typeof over === "string") void move(entry, over);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Poprzedni tydzień" onClick={onPrevWeek}>
          <ChevronLeft />
        </Button>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">
            {DAY_FMT.format(new Date(`${schedule.dates[0]}T00:00:00`))} –{" "}
            {DAY_FMT.format(new Date(`${schedule.dates[6]}T00:00:00`))}
          </span>
          {!schedule.dates.includes(today) && (
            <Button variant="ghost" size="sm" onClick={onToday}>
              Dziś
            </Button>
          )}
          {pendingWrite && <Spinner size="sm" className="text-muted-foreground" />}
        </div>
        <Button variant="outline" size="icon-sm" aria-label="Następny tydzień" onClick={onNextWeek}>
          <ChevronRight />
        </Button>
      </div>

      {/* No blocking empty state — the week works without plans (ad-hoc
          entries via the day "+", done markers). A plan-less user just gets
          a hint on top of the real thing. */}
      {!hasAnyPlan && (
        <div className="rounded-xl border border-dashed px-4 py-3 text-muted-foreground text-sm">
          Nie masz jeszcze planu treningowego — dodaj trening w dowolny dzień plusem albo{" "}
          <button
            type="button"
            className="font-semibold text-primary underline-offset-4 hover:underline"
            onClick={onShowPlans}
          >
            stwórz plan
          </button>
          , który sam ułoży Ci tydzień.
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex flex-col gap-3">
          {schedule.dates.map((date, dayOfWeek) => (
            <DayCard
              key={date}
              date={date}
              dayOfWeek={dayOfWeek}
              isToday={date === today}
              entries={entriesByDate.get(date) ?? []}
              done={sessionsByDate.get(date) ?? []}
              onAdd={() => onAddToDay(date, dayOfWeek)}
              onEntryTap={setAction}
            />
          ))}
        </div>
        {/* No drop animation: the default flies the overlay back toward the
            source slot, which reads as a bounce before the optimistic move
            lands. Vanish-at-drop + instant re-render reads as "it moved". */}
        <DragOverlay dropAnimation={null}>{dragged ? <EntryCard entry={dragged} overlay /> : null}</DragOverlay>
      </DndContext>

      <EntryActionSheet
        entry={action}
        dates={schedule.dates}
        onClose={() => setAction(null)}
        onEdit={(entry) => {
          setAction(null);
          onEditEntry(entry);
        }}
        onMove={(entry, toDate) => {
          setAction(null);
          void move(entry, toDate);
        }}
        onRemove={(entry) => {
          setAction(null);
          void remove(entry);
        }}
        onSetSlot={(entry, slot) => {
          setAction(null);
          void (async () => {
            try {
              await setScheduleEntrySlot({
                data:
                  entry.source === "PLAN"
                    ? { kind: "PLAN", unitId: entry.unitId as string, date: entry.date, slot }
                    : { kind: "OVERRIDE", overrideId: entry.overrideId as string, slot },
              });
              await router.invalidate();
            } catch (err) {
              toast.error(getErrorMessage(err, "Nie udało się zmienić pory dnia."));
            }
          })();
        }}
      />
    </div>
  );
}

function DayCard({
  date,
  dayOfWeek,
  isToday,
  entries,
  done,
  onAdd,
  onEntryTap,
}: {
  date: string;
  dayOfWeek: number;
  isToday: boolean;
  entries: ScheduleEntry[];
  done: WeekSchedule["sessions"];
  onAdd: () => void;
  onEntryTap: (entry: ScheduleEntry) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: date });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border bg-card p-3 transition-colors ${
        isToday ? "border-primary/50 ring-1 ring-primary/30" : ""
      } ${isOver ? "border-ember bg-accent" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`font-bold text-xs uppercase tracking-wide ${isToday ? "text-primary" : ""}`}>
          {WEEKDAY_FULL_PL[dayOfWeek]}{" "}
          <span className="font-medium text-muted-foreground normal-case">
            {DAY_FMT.format(new Date(`${date}T00:00:00`))}
          </span>
          {isToday && " · dziś"}
        </span>
        <button
          type="button"
          aria-label={`Dodaj trening — ${WEEKDAY_FULL_PL[dayOfWeek]}`}
          onClick={onAdd}
          className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {entries.length > 0 ? (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <DraggableEntry key={entryDragId(entry)} entry={entry} onTap={() => onEntryTap(entry)} />
          ))}
        </ul>
      ) : (
        done.length === 0 && <p className="text-muted-foreground text-sm">Wolne</p>
      )}

      {/* Finished sessions logged on this date — what actually happened,
          next to what was planned. */}
      {done.length > 0 && (
        <ul className={`space-y-0.5 ${entries.length > 0 ? "mt-2 border-t pt-2" : ""}`}>
          {done.map((s) => (
            <li key={s.id}>
              <Link
                to="/sessions/$sessionId"
                params={{ sessionId: s.id }}
                className="flex items-center gap-1.5 rounded-md px-1 py-1 text-emerald-600 text-xs transition-colors hover:bg-accent dark:text-emerald-400"
              >
                <CheckCircle2 className="size-3.5 shrink-0" />
                <span className="truncate">
                  {SESSION_TYPE_LABEL_PL[s.type] ?? s.type}
                  {s.title ? ` · ${s.title}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DraggableEntry({ entry, onTap }: { entry: ScheduleEntry; onTap: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entryDragId(entry),
    data: { entry },
  });

  return (
    <li ref={setNodeRef} className={isDragging ? "opacity-40" : ""}>
      <button
        type="button"
        className="w-full touch-manipulation text-left"
        onClick={onTap}
        {...listeners}
        {...attributes}
      >
        <EntryCard entry={entry} />
      </button>
    </li>
  );
}

function EntryCard({ entry, overlay = false }: { entry: ScheduleEntry; overlay?: boolean }) {
  const label = unitTrainingLabel(entry);
  return (
    <div className={`rounded-lg border bg-background px-3 py-2 ${overlay ? "shadow-lg ring-1 ring-ember" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {entry.sessionType === "STRENGTH" && <Dumbbell className="size-3 shrink-0 text-primary" />}
          <span className="min-w-0 truncate font-medium text-sm">{entry.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span aria-label={DAY_SLOT_LABEL[entry.slot]} role="img">
            {entry.slot === "MORNING" ? (
              <Sun className="size-3 text-muted-foreground" />
            ) : (
              <Moon className="size-3 text-muted-foreground" />
            )}
          </span>
          {entry.intensity && (
            <span
              className={`rounded-full px-2 py-0.5 font-bold text-[10px] uppercase tracking-wide ${UNIT_INTENSITY_CLASS[entry.intensity]}`}
            >
              {UNIT_INTENSITY_LABEL[entry.intensity]}
            </span>
          )}
        </span>
      </div>
      <p className="mt-0.5 truncate text-muted-foreground text-xs">
        {entry.source === "ADHOC" ? "poza planem" : entry.planName} · {SESSION_TYPE_LABEL_PL[entry.sessionType]}
        {entry.source === "ADD" && entry.relocated && " · przeniesiony"}
      </p>
      {label && entry.name !== label && (
        <p className="wrap-break-word mt-1 line-clamp-2 whitespace-pre-line text-xs">{label}</p>
      )}
      {entry.exercises.length > 0 && (
        <p className="mt-1 truncate text-muted-foreground text-xs">
          {entry.exercises.map((e) => e.namePl).join(" · ")}
        </p>
      )}
      {(entry.goal || entry.note) && (
        <p className="mt-1 flex items-baseline gap-1.5 truncate text-muted-foreground text-xs">
          <Target className="size-3 shrink-0 translate-y-px" />
          {entry.goal ?? entry.note}
        </p>
      )}
    </div>
  );
}

function EntryActionSheet({
  entry,
  dates,
  onClose,
  onEdit,
  onMove,
  onRemove,
  onSetSlot,
}: {
  entry: ScheduleEntry | null;
  dates: string[];
  onClose: () => void;
  onEdit: (entry: ScheduleEntry) => void;
  onMove: (entry: ScheduleEntry, toDate: string) => void;
  onRemove: (entry: ScheduleEntry) => void;
  onSetSlot: (entry: ScheduleEntry, slot: DaySlot) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) {
          setConfirmRemove(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        {entry ? (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle>{entry.name}</DialogTitle>
              <DialogDescription>
                {entry.source === "ADHOC" ? "Trening poza planem" : `Plan „${entry.planName}”`} ·{" "}
                {WEEKDAY_FULL_PL[dates.indexOf(entry.date)]}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
              {entry.unitId && (
                <Button variant="outline" className="w-full" onClick={() => onEdit(entry)}>
                  Edytuj trening
                </Button>
              )}

              <div>
                <p className="mb-1.5 font-medium text-muted-foreground text-xs">Pora dnia</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {DAY_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      disabled={slot === entry.slot}
                      className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 font-semibold text-xs transition-colors ${
                        slot === entry.slot
                          ? "border-transparent bg-ember"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                      onClick={() => onSetSlot(entry, slot)}
                    >
                      {slot === "MORNING" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                      {DAY_SLOT_LABEL[slot]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 font-medium text-muted-foreground text-xs">
                  Przenieś na inny dzień (tylko w tym tygodniu)
                </p>
                <div className="grid grid-cols-7 gap-1">
                  {dates.map((date, day) => (
                    <button
                      key={date}
                      type="button"
                      disabled={date === entry.date}
                      className={`rounded-md border px-0.5 py-1.5 font-semibold text-[10px] transition-colors disabled:opacity-40 ${
                        date === entry.date
                          ? "border-transparent bg-ember"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                      onClick={() => onMove(entry, date)}
                    >
                      {WEEKDAY_FULL_PL[day].slice(0, 3).toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => setConfirmRemove(true)}
              >
                {entry.source === "PLAN" ? "Usuń z tego dnia (tylko ten tydzień)" : "Usuń z tego dnia"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>

      {entry && (
        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title="Usunąć trening z tego dnia?"
          description={entry.source === "PLAN" ? "Usuwa tylko to wystąpienie (ten tydzień) — plan zostaje." : undefined}
          confirmLabel={entry.source === "PLAN" ? "Usuń z tego dnia (tylko ten tydzień)" : "Usuń z tego dnia"}
          onConfirm={() => {
            setConfirmRemove(false);
            onRemove(entry);
          }}
        />
      )}
    </Dialog>
  );
}
