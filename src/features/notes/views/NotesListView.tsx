import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { NotebookPen } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { noteParts } from "@/features/notes/lib/note-title";
import { createNote } from "@/features/notes/server/notes";
import { getErrorMessage } from "@/lib/error-message";
import { SearchInput } from "@/shared/components/SearchInput";

const route = getRouteApi("/_shell/notes/");

const NOTE_DATE_FMT = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric" });

export function NotesListView() {
  const notes = route.useLoaderData();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
              <li key={n.id} className="border-b last:border-b-0">
                <Link
                  to="/notes/$noteId"
                  params={{ noteId: n.id }}
                  className="block px-4 py-3 transition-colors hover:bg-accent"
                >
                  <p className={`truncate font-semibold text-sm ${title ? "" : "text-muted-foreground"}`}>
                    {title ?? "Bez tytułu"}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    {NOTE_DATE_FMT.format(new Date(n.updatedAt))}
                    {preview ? ` · ${preview}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
