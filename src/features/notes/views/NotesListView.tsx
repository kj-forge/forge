import { getRouteApi, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { NotebookPen, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { noteParts } from "@/features/notes/lib/note-title";
import { createNote, deleteNote } from "@/features/notes/server/notes";
import { getErrorMessage } from "@/lib/error-message";
import { SearchInput } from "@/shared/components/SearchInput";

const route = getRouteApi("/_shell/notes/");

const NOTE_DATE_FMT = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric" });

export function NotesListView() {
  const notes = route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Note picked for deletion — its title feeds the confirm dialog.
  const [toDelete, setToDelete] = useState<{ id: string; title: string | null } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q ? notes.filter((n) => n.body.toLowerCase().includes(q)) : notes;

  const handleCreate = () => {
    if (creating) return;
    setError(null);
    setCreating(true);
    createNote()
      .then((row) => navigate({ to: "/notes/$noteId", params: { noteId: row.id } }))
      .catch((err) => {
        setError(getErrorMessage(err, "Nie udało się utworzyć notatki."));
        setCreating(false);
      });
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteNote({ data: { noteId: toDelete.id } });
      await router.invalidate();
      setToDelete(null);
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się usunąć notatki."));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="font-bold text-2xl tracking-tight">Notatki</h1>
        <Button size="sm" className="bg-ember shadow-ember" disabled={creating} onClick={handleCreate}>
          {creating ? "Tworzę..." : "+ Nowa"}
        </Button>
      </div>

      {notes.length > 0 && (
        <SearchInput
          placeholder="Szukaj w notatkach..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={100}
        />
      )}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {notes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground text-sm">
            <NotebookPen className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
            Zeszyt jest pusty — zapisz pierwszą myśl treningową.
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-muted-foreground text-sm">Brak notatek pasujących do wyszukiwania.</p>
      ) : (
        <ul className="overflow-hidden rounded-xl border bg-card">
          {filtered.map((n) => {
            const { title, preview } = noteParts(n.body);
            return (
              <li key={n.id} className="flex items-center border-b last:border-b-0">
                <Link
                  to="/notes/$noteId"
                  params={{ noteId: n.id }}
                  className="block min-w-0 flex-1 py-3 pl-4 transition-colors hover:bg-accent"
                >
                  <p className={`truncate font-semibold text-sm ${title ? "" : "text-muted-foreground"}`}>
                    {title ?? "Bez tytułu"}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    {NOTE_DATE_FMT.format(new Date(n.updatedAt))}
                    {preview ? ` · ${preview}` : ""}
                  </p>
                </Link>
                <button
                  type="button"
                  aria-label={`Usuń notatkę: ${title ?? "Bez tytułu"}`}
                  className="flex shrink-0 items-center self-stretch px-4 text-muted-foreground/70 transition-colors hover:text-destructive"
                  onClick={() => setToDelete({ id: n.id, title })}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o && !deleting) setToDelete(null);
        }}
      >
        <DialogContent mobileSheet>
          <div className="mx-auto w-full max-w-md">
            <DialogHeader>
              <DialogTitle>Usunąć „{toDelete?.title ?? "Bez tytułu"}”?</DialogTitle>
              <DialogDescription>Nie da się tego cofnąć.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="destructive" className="w-full" disabled={deleting} onClick={handleDelete}>
                {deleting ? "Usuwam..." : "Tak, usuń"}
              </Button>
              <DialogClose asChild>
                <Button variant="outline" className="w-full" disabled={deleting}>
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
