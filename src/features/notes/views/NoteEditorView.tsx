import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Textarea } from "@/components/ui/textarea";
import { updateNote } from "@/features/notes/server/notes";
import { BackLink } from "@/shared/components/BackLink";

const route = getRouteApi("/_shell/notes/$noteId");

const AUTOSAVE_MS = 800;

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function NoteEditorView() {
  const note = route.useLoaderData();

  if (!note) {
    return (
      <main className="flex w-full flex-col gap-3 p-4">
        <BackLink to="/notes" label="Notatki" />
        <p className="py-6 text-center text-muted-foreground text-sm">Nie znaleziono notatki.</p>
      </main>
    );
  }

  return <NoteEditorBody key={note.id} note={note} />;
}

function NoteEditorBody({ note }: { note: { id: string; body: string } }) {
  const [body, setBody] = useState(note.body);
  const [status, setStatus] = useState<SaveStatus>("idle");

  // Autosave plumbing: refs so the debounce timer and blur-flush always see
  // the latest text without re-creating callbacks; seq drops stale responses
  // (a slow save must not overwrite the status of a newer one).
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef(note.body);
  const lastSavedRef = useRef(note.body);

  useEffect(() => () => clearTimeout(timerRef.current ?? undefined), []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The blank space under the text is still "the page" — tapping it focuses
  // the textarea with the caret at the end, like tapping the empty part of a
  // paper note. focus({ preventScroll }) skips the browser's reveal-scroll:
  // the tapped spot is on screen by definition, so no jump.
  const focusPage = (e: React.PointerEvent) => {
    const ta = textareaRef.current;
    if (!ta) return;
    // Keep the native focus/blur cycle out of it (a blur here would also
    // fire the autosave flush for no reason).
    e.preventDefault();
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
  };

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

  return (
    // Full width and full height of the shell's scroll area: the note IS the
    // page (Apple Notes style), padding is the only inset. Deleting lives on
    // the list rows — the editor is for writing.
    <main className="flex min-h-full w-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between pt-2">
        <BackLink to="/notes" label="Notatki" onNavigate={flush} />
        <SaveIndicator status={status} onRetry={() => save(bodyRef.current)} />
      </div>

      <Textarea
        ref={textareaRef}
        // Borderless notebook page; field-sizing-content (base Textarea)
        // grows with the text, so the element is never taller than the note
        // itself — on mobile that keeps iOS from "revealing" it with a
        // forced scroll on focus. text-base keeps iOS from zooming on focus.
        className="min-h-40 resize-none rounded-none border-none bg-transparent px-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
        placeholder={"Pierwsza linia to tytuł...\n\nWnioski, technika, pomysły na blok."}
        value={body}
        maxLength={20000}
        autoFocus={note.body.length === 0}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={flush}
      />

      {/* Pointer-only convenience — the textarea stays the accessible control. */}
      <div className="-mt-3 min-h-24 flex-1 cursor-text" onPointerDown={focusPage} />
    </main>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  // "Zapisano" lingers briefly, then fades out slowly and unmounts. It sits
  // at the flex row's right edge, so the unmount shifts nothing visible.
  const [phase, setPhase] = useState<"visible" | "fading" | "hidden">("hidden");
  useEffect(() => {
    if (status !== "saved") {
      setPhase(status === "idle" ? "hidden" : "visible");
      return;
    }
    setPhase("visible");
    const fade = setTimeout(() => setPhase("fading"), 1500);
    const hide = setTimeout(() => setPhase("hidden"), 2700);
    return () => {
      clearTimeout(fade);
      clearTimeout(hide);
    };
  }, [status]);

  if (status === "idle") return null;
  if (status === "error") {
    return (
      <button type="button" className="font-medium text-destructive text-xs underline-offset-4" onClick={onRetry}>
        Błąd zapisu — spróbuj ponownie
      </button>
    );
  }
  if (status === "saved" && phase === "hidden") return null;
  return (
    <span
      className={`text-muted-foreground text-xs transition-opacity duration-1000 ${
        status === "saved" && phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
    >
      {status === "saving" ? "Zapisywanie..." : "Zapisano"}
    </span>
  );
}
