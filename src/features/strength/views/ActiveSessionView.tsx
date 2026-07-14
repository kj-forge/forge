import { getRouteApi, useNavigate, useRouter } from "@tanstack/react-router";
import dayjs from "dayjs";
import { NotebookPen, RotateCcw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteSessionDrawer } from "@/features/strength/components/DeleteSessionDrawer";
import { EndSessionDrawer } from "@/features/strength/components/EndSessionDrawer";
import { ExercisePickerDrawer } from "@/features/strength/components/ExercisePickerDrawer";
import { MovementRow } from "@/features/strength/components/MovementRow";
import { NotesDrawer } from "@/features/strength/components/NotesDrawer";
import { addExerciseToSession } from "@/features/strength/server/movements";
import { createSession, deleteSession, endSession, updateSessionNotes } from "@/features/strength/server/sessions";
import { getErrorMessage } from "@/lib/error-message";
import { StatusBadge } from "@/shared/components/StatusBadge";

const route = getRouteApi("/_shell/sessions/$sessionId");

export function ActiveSessionView() {
  const { session, movements } = route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const isEnded = session.endedAt !== null;

  // Same-day repeat of an ended session: new session cloned from this one's
  // exercise list (sets start empty; the drawer seeds weights from history).
  const repeatSession = async () => {
    setCopyError(null);
    setCopying(true);
    try {
      const result = await createSession({
        data: { type: session.type, date: dayjs().format("YYYY-MM-DD"), fromTemplateSessionId: session.id },
      });
      navigate({ to: "/sessions/$sessionId", params: { sessionId: result.sessionId } });
    } catch (err) {
      setCopyError(getErrorMessage(err, "Nie udało się utworzyć sesji."));
      setCopying(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4 pb-0">
      <header className="flex items-center justify-end pt-2">
        <span className="text-muted-foreground text-xs">
          {new Date(session.date).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </header>

      <div className="space-y-2">
        <h1 className="font-bold text-2xl tracking-tight">Sesja siłowa</h1>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <StatusBadge endedAt={session.endedAt} />
          {movements.length > 0 && <span>· {movements.length} ćwiczeń</span>}
        </div>
      </div>

      {movements.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Brak ćwiczeń. Dodaj pierwsze poniżej.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {movements.map((m) => (
            <li key={m.id}>
              <MovementRow movement={m} isEnded={isEnded} />
            </li>
          ))}
        </ul>
      )}

      {isEnded && (
        <Card>
          <CardContent className="space-y-2 py-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 font-medium text-sm">
                <NotebookPen className="size-3.5 text-primary" />
                Notatki
              </p>
              <button
                type="button"
                className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                onClick={() => setNotesOpen(true)}
              >
                {session.notes ? "Edytuj" : "Dodaj"}
              </button>
            </div>
            {session.notes ? (
              <p className="whitespace-pre-wrap text-muted-foreground text-sm">{session.notes}</p>
            ) : (
              <p className="text-muted-foreground text-xs italic">Brak notatek</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sticky (not fixed): occupies layout space at the end of the scroll
          container, so content can never be hidden behind it — no manual
          bottom-padding clearance to keep in sync with its height. */}
      <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 border-t bg-background px-4 pt-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)-1.75rem))]">
        {!isEnded ? (
          <>
            <Button type="button" variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
              + Dodaj ćwiczenie
            </Button>
            <Button type="button" className="w-full bg-ember shadow-ember" onClick={() => setEndOpen(true)}>
              Zakończ sesję
            </Button>
          </>
        ) : (
          <>
            <Button type="button" className="w-full bg-ember shadow-ember" onClick={repeatSession} disabled={copying}>
              {copying ? (
                "Tworzę..."
              ) : (
                <>
                  <RotateCcw className="size-4" />
                  Trenuj na tej bazie
                </>
              )}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => setNotesOpen(true)}>
              Edytuj notatki
            </Button>
            {copyError && (
              <p className="text-destructive text-xs" role="alert">
                {copyError}
              </p>
            )}
          </>
        )}
        <button
          type="button"
          className="w-full text-muted-foreground text-xs underline-offset-4 hover:text-destructive hover:underline"
          onClick={() => setDeleteOpen(true)}
        >
          Usuń sesję
        </button>
      </div>

      <ExercisePickerDrawer
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPicked={async (exerciseId) => {
          await addExerciseToSession({ data: { sessionId: session.id, exerciseId } });
          await router.invalidate();
          setPickerOpen(false);
        }}
      />

      <NotesDrawer
        open={notesOpen}
        onOpenChange={setNotesOpen}
        initialNotes={session.notes ?? ""}
        onSave={async (notes) => {
          await updateSessionNotes({ data: { sessionId: session.id, notes } });
          await router.invalidate();
          setNotesOpen(false);
        }}
      />

      <DeleteSessionDrawer
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        isEnded={isEnded}
        onConfirm={async () => {
          await deleteSession({ data: { sessionId: session.id } });
          navigate({ to: "/" });
        }}
      />

      <EndSessionDrawer
        open={endOpen}
        onOpenChange={setEndOpen}
        movementCount={movements.length}
        onConfirm={async (notes) => {
          await endSession({ data: { sessionId: session.id, notes } });
          await router.invalidate();
          setEndOpen(false);
        }}
      />
    </main>
  );
}
