import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { DeleteSessionDrawer } from "@/features/strength/components/DeleteSessionDrawer";
import { EditHyroxBlockSheet } from "@/features/strength/components/EditHyroxBlockSheet";
import { EndSessionDrawer } from "@/features/strength/components/EndSessionDrawer";
import { ExercisePickerDrawer } from "@/features/strength/components/ExercisePickerDrawer";
import { HyroxIdleScreen, HyroxRestScreen, HyroxStationScreen } from "@/features/strength/components/HyroxLiveScreens";
import {
  HyroxBlockDoneScreen,
  HyroxDoneSummary,
  liveSegmentsToPersisted,
} from "@/features/strength/components/HyroxSummaries";
import { type HyroxLive, useHyroxLive } from "@/features/strength/components/useHyroxLive";
import { readSessionOrigin, SESSION_ORIGIN_TARGET, type SessionOrigin } from "@/features/strength/lib/session-origin";
import { deleteSession, updateSessionNotes } from "@/features/strength/server/sessions";
import { addExerciseToStep } from "@/features/strength/server/steps";
import { BackLink } from "@/shared/components/BackLink";
import { StatusBadge } from "@/shared/components/StatusBadge";

const route = getRouteApi("/_shell/sessions/$sessionId");

// The live phase machine, rendered against a session that is not yet ended.
// blockDone/done route into this task's summary screens; both funnel into
// the same finish confirmation drawer, owned here since it needs live.finish.
function HyroxLiveScreen({
  live,
  notes,
  origin,
  onRequestFinish,
  onSaveNotes,
  onDeleteSession,
  onEditBlock,
}: {
  live: HyroxLive;
  notes: string | null;
  origin: SessionOrigin;
  onRequestFinish: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
  onDeleteSession: () => Promise<void>;
  onEditBlock: () => void;
}) {
  switch (live.state.phase) {
    case "idle":
      return <HyroxIdleScreen live={live} onEditBlock={onEditBlock} />;
    case "station":
    case "rox":
      return <HyroxStationScreen live={live} />;
    case "rest":
      return <HyroxRestScreen live={live} />;
    case "blockDone":
      return <HyroxBlockDoneScreen live={live} onRequestFinish={onRequestFinish} />;
    case "done":
      return (
        <HyroxDoneSummary
          plan={live.plan}
          segments={liveSegmentsToPersisted(live.plan, live.state.segments)}
          notes={notes}
          isEnded={false}
          origin={origin}
          onSaveNotes={onSaveNotes}
          onDeleteSession={onDeleteSession}
          onRequestFinish={onRequestFinish}
          syncError={live.syncError}
        />
      );
  }
}

// Session view for HYROX-type sessions: read-only block preview until start,
// then Task 7's live screens driven entirely by useHyroxLive's phase. Ended
// sessions and empty (undeclared) sessions keep the original read-only cards
// — the live timeline only ever applies to an in-progress session with steps.
export function HyroxSessionView() {
  const { session, steps, segments } = route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  // SSR never sees history.state, so the initial (and hydration) render must
  // assume the fallback; promote to the real origin once, after mount, from
  // the state snapshot present at that point. Empty deps: this is a one-shot
  // promotion, not a subscription — later location changes must not re-read it.
  const [origin, setOrigin] = useState<SessionOrigin>("historia");
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once promotion by design — must not re-read origin on later location changes.
  useEffect(() => {
    setOrigin(readSessionOrigin(location.state));
  }, []);
  const isEnded = session.endedAt !== null;
  const live = useHyroxLive(session.id, steps, segments, { enabled: !isEnded });
  const [finishOpen, setFinishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ID only, never the Step object itself — re-derived from loader `steps` on
  // every render so an add/remove inside the sheet (router.invalidate()) is
  // reflected without the sheet ever holding a stale snapshot.
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const editingStep = steps.find((s) => s.id === editingBlockId) ?? null;
  const [stationPickerOpen, setStationPickerOpen] = useState(false);

  const saveNotes = async (notes: string) => {
    await updateSessionNotes({ data: { sessionId: session.id, notes } });
    await router.invalidate();
  };

  const removeSession = async () => {
    await deleteSession({ data: { sessionId: session.id } });
    queryClient.invalidateQueries({ queryKey: ["history"] });
    navigate({ to: SESSION_ORIGIN_TARGET[origin].to });
  };

  if (steps.length === 0) {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4 pb-0">
        <header className={`flex items-center ${isEnded ? "justify-between" : "justify-end"} pt-2`}>
          {isEnded && <BackLink to={SESSION_ORIGIN_TARGET[origin].to} label={SESSION_ORIGIN_TARGET[origin].label} />}
          <span className="text-muted-foreground text-xs">
            {new Date(session.date).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </header>

        <div className="space-y-2">
          <h1 className="font-bold text-2xl tracking-tight">Sesja Hyrox</h1>
          <StatusBadge endedAt={session.endedAt} />
        </div>

        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Trening Hyrox deklarujesz w planie. Wystartuj sesję z planu, żeby dostać bloki i stoper.
          </CardContent>
        </Card>

        <button
          type="button"
          className="w-full text-muted-foreground text-xs underline-offset-4 hover:text-destructive hover:underline"
          onClick={() => setDeleteOpen(true)}
        >
          Usuń sesję
        </button>

        <DeleteSessionDrawer
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          isEnded={isEnded}
          onConfirm={removeSession}
        />
      </main>
    );
  }

  if (isEnded) {
    return (
      <HyroxDoneSummary
        plan={live.plan}
        segments={segments}
        notes={session.notes}
        isEnded
        origin={origin}
        onSaveNotes={saveNotes}
        onDeleteSession={removeSession}
      />
    );
  }

  // The journal (useHyroxLive) lazily reads localStorage on init, so server HTML and the
  // first client render disagree — keep the live tree client-only until mounted.
  if (!mounted) {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4 pb-0">
        <header className="flex items-center justify-end pt-2">
          <span className="text-muted-foreground text-xs">
            {new Date(session.date).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </header>

        <div className="space-y-2">
          <h1 className="font-bold text-2xl tracking-tight">Sesja Hyrox</h1>
          <StatusBadge endedAt={session.endedAt} />
        </div>
      </main>
    );
  }

  const finishStationCount = live.plan.reduce((n, b) => n + b.stations.length, 0);

  return (
    <>
      <HyroxLiveScreen
        live={live}
        notes={session.notes}
        origin={origin}
        onRequestFinish={() => setFinishOpen(true)}
        onSaveNotes={saveNotes}
        onDeleteSession={removeSession}
        onEditBlock={() => {
          const block = live.plan[live.state.blockIndex];
          if (block) setEditingBlockId(block.blockId);
        }}
      />
      <EditHyroxBlockSheet
        step={editingStep}
        onClose={() => setEditingBlockId(null)}
        onPickExercise={() => setStationPickerOpen(true)}
      />
      <ExercisePickerDrawer
        open={stationPickerOpen}
        onOpenChange={setStationPickerOpen}
        title="Dodaj stację"
        onPicked={async (exerciseId) => {
          if (!editingBlockId) return;
          await addExerciseToStep({ data: { blockId: editingBlockId, exerciseId } });
          await router.invalidate();
          setStationPickerOpen(false);
        }}
      />
      <EndSessionDrawer
        open={finishOpen}
        onOpenChange={setFinishOpen}
        movementCount={finishStationCount}
        onConfirm={(notes) => live.finish(notes)}
      />
    </>
  );
}
