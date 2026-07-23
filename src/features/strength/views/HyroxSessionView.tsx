import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { EndSessionDrawer } from "@/features/strength/components/EndSessionDrawer";
import { HyroxIdleScreen, HyroxRestScreen, HyroxStationScreen } from "@/features/strength/components/HyroxLiveScreens";
import {
  HyroxBlockDoneScreen,
  HyroxDoneSummary,
  liveSegmentsToPersisted,
} from "@/features/strength/components/HyroxSummaries";
import { type HyroxLive, useHyroxLive } from "@/features/strength/components/useHyroxLive";
import { deleteSession, updateSessionNotes } from "@/features/strength/server/sessions";
import { StatusBadge } from "@/shared/components/StatusBadge";

const route = getRouteApi("/_shell/sessions/$sessionId");

// The live phase machine, rendered against a session that is not yet ended.
// blockDone/done route into this task's summary screens; both funnel into
// the same finish confirmation drawer, owned here since it needs live.finish.
function HyroxLiveScreen({
  live,
  notes,
  onRequestFinish,
  onSaveNotes,
  onDeleteSession,
}: {
  live: HyroxLive;
  notes: string | null;
  onRequestFinish: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
  onDeleteSession: () => Promise<void>;
}) {
  switch (live.state.phase) {
    case "idle":
      return <HyroxIdleScreen live={live} />;
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
  const isEnded = session.endedAt !== null;
  const live = useHyroxLive(session.id, steps, segments, { enabled: !isEnded });
  const [finishOpen, setFinishOpen] = useState(false);

  const saveNotes = async (notes: string) => {
    await updateSessionNotes({ data: { sessionId: session.id, notes } });
    await router.invalidate();
  };

  const removeSession = async () => {
    await deleteSession({ data: { sessionId: session.id } });
    navigate({ to: "/" });
  };

  if (isEnded) {
    return (
      <HyroxDoneSummary
        plan={live.plan}
        segments={segments}
        notes={session.notes}
        isEnded
        onSaveNotes={saveNotes}
        onDeleteSession={removeSession}
      />
    );
  }

  if (steps.length === 0) {
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

        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Trening Hyrox deklarujesz w planie. Wystartuj sesję z planu, żeby dostać bloki i stoper.
          </CardContent>
        </Card>
      </main>
    );
  }

  const finishStationCount = live.plan[live.state.blockIndex]?.stations.length ?? 0;

  return (
    <>
      <HyroxLiveScreen
        live={live}
        notes={session.notes}
        onRequestFinish={() => setFinishOpen(true)}
        onSaveNotes={saveNotes}
        onDeleteSession={removeSession}
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
