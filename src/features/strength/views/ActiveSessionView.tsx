import { getRouteApi, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteSessionDrawer } from "@/features/strength/components/DeleteSessionDrawer";
import { EndSessionDrawer } from "@/features/strength/components/EndSessionDrawer";
import { ExercisePickerDrawer } from "@/features/strength/components/ExercisePickerDrawer";
import { MovementRow } from "@/features/strength/components/MovementRow";
import { NotesDrawer } from "@/features/strength/components/NotesDrawer";
import { addExerciseToSession } from "@/features/strength/server/movements";
import { deleteSession, endSession, updateSessionNotes } from "@/features/strength/server/sessions";
import { StatusBadge } from "@/shared/components/StatusBadge";

const route = getRouteApi("/sessions/$sessionId");

export function ActiveSessionView() {
  const { session, movements } = route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isEnded = session.endedAt !== null;

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-3 p-4 pb-32">
      <header className="flex items-center justify-between pt-2">
        <Link to="/" className="text-muted-foreground text-sm">
          ← Wróć
        </Link>
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
              <p className="font-medium text-sm">📝 Notatki</p>
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

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md space-y-2 border-t bg-background p-4">
        {!isEnded ? (
          <>
            <Button type="button" variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
              + Dodaj ćwiczenie
            </Button>
            <Button type="button" className="w-full" onClick={() => setEndOpen(true)}>
              Zakończ sesję
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" className="w-full" onClick={() => setNotesOpen(true)}>
            ✏️ Edytuj notatki
          </Button>
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
