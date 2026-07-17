import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { deleteNote, updateNote } from "@/features/notes/server/notes";

const route = getRouteApi("/_shell/notes/$noteId");

const AUTOSAVE_MS = 800;

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function NoteEditorView() {
  const note = route.useLoaderData();
  const navigate = useNavigate();

  if (!note) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
        <BackLink />
        <p className="py-6 text-center text-muted-foreground text-sm">Nie znaleziono notatki.</p>
      </main>
    );
  }

  return <NoteEditorBody key={note.id} note={note} onDeleted={() => navigate({ to: "/notes" })} />;
}

function NoteEditorBody({ note, onDeleted }: { note: { id: string; body: string }; onDeleted: () => void }) {
  const [body, setBody] = useState(note.body);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Autosave plumbing: refs so the debounce timer and blur-flush always see
  // the latest text without re-creating callbacks; seq drops stale responses
  // (a slow save must not overwrite the status of a newer one).
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef(note.body);
  const lastSavedRef = useRef(note.body);

  useEffect(() => () => clearTimeout(timerRef.current ?? undefined), []);

  const save = (text: string) => {
    const seq = ++seqRef.current;
    setStatus("saving");
    updateNote({ data: { noteId: note.id, body: text } })
      .then(() => {
        if (seq !== seqRef.current) return;
        lastSavedRef.current = text;
        setStatus("saved");
      })
      .catch(() => {
        // The text stays in the textarea — only the save failed.
        if (seq === seqRef.current) setStatus("error");
      });
  };

  const handleChange = (text: string) => {
    setBody(text);
    bodyRef.current = text;
    clearTimeout(timerRef.current ?? undefined);
    timerRef.current = setTimeout(() => save(bodyRef.current), AUTOSAVE_MS);
  };

  // Blur (tap outside, keyboard dismiss, clicking a link) saves immediately —
  // the fetch survives unmount, so leaving the page doesn't lose the text.
  const flush = () => {
    if (bodyRef.current === lastSavedRef.current) return;
    clearTimeout(timerRef.current ?? undefined);
    save(bodyRef.current);
  };

  const handleDelete = () => {
    setDeleting(true);
    // Cancel any in-flight autosave result — the note is going away.
    seqRef.current++;
    clearTimeout(timerRef.current ?? undefined);
    deleteNote({ data: { noteId: note.id } })
      .then(() => onDeleted())
      .catch(() => {
        setDeleting(false);
        setConfirmOpen(false);
        setStatus("error");
      });
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
      <div className="flex items-center justify-between pt-2">
        <BackLink onNavigate={flush} />
        <span className="flex items-center gap-2">
          <SaveIndicator status={status} onRetry={() => save(bodyRef.current)} />
          <button
            type="button"
            aria-label="Usuń notatkę"
            className="grid size-8 place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
          </button>
        </span>
      </div>

      <Textarea
        // Borderless notebook page; field-sizing-content (base Textarea)
        // grows with the text. text-base keeps iOS from zooming on focus.
        className="min-h-[55dvh] resize-none rounded-none border-none bg-transparent px-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
        placeholder={"Pierwsza linia to tytuł...\n\nWnioski, technika, pomysły na blok."}
        value={body}
        maxLength={20000}
        autoFocus={note.body.length === 0}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={flush}
      />

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o) setConfirmOpen(false);
        }}
      >
        <DialogContent mobileSheet>
          <div className="mx-auto w-full max-w-md">
            <DialogHeader>
              <DialogTitle>Usunąć notatkę?</DialogTitle>
              <DialogDescription>Nie da się tego cofnąć.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="destructive" className="w-full" disabled={deleting} onClick={handleDelete}>
                {deleting ? "Usuwam..." : "Tak, usuń"}
              </Button>
              <DialogClose asChild>
                <Button variant="outline" className="w-full">
                  Anuluj
                </Button>
              </DialogClose>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "idle") return null;
  if (status === "error") {
    return (
      <button type="button" className="font-medium text-destructive text-xs underline-offset-4" onClick={onRetry}>
        Błąd zapisu — spróbuj ponownie
      </button>
    );
  }
  return <span className="text-muted-foreground text-xs">{status === "saving" ? "Zapisywanie..." : "Zapisano"}</span>;
}

function BackLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      to="/notes"
      onClick={onNavigate}
      className="inline-flex items-center gap-0.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" />
      Notatki
    </Link>
  );
}
