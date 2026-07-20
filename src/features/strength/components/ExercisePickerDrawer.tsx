import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EXERCISE_CATEGORY_LABEL } from "@/features/strength/constants";
import { createExercise, searchExercises } from "@/features/strength/server/exercises";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

interface ExercisePickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: (exerciseId: string) => Promise<void>;
  // Multi-select mode ("+ Obwód"): rows toggle a numbered selection
  // (order = round order) and a sticky confirm hands back the whole list.
  multi?: boolean;
  onPickedMany?: (exerciseIds: string[]) => Promise<void>;
  title?: string;
}

// The drawer shell is always mounted. The search form, however, is
// conditionally rendered — when `open` flips to false the form unmounts,
// taking its query/results/selection state with it. On the next open the
// form mounts fresh — no `useEffect`-driven reset required.
export function ExercisePickerDrawer({
  open,
  onOpenChange,
  onPicked,
  multi = false,
  onPickedMany,
  title,
}: ExercisePickerDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Input pinned near the top of the full-screen page so it stays
          visible regardless of what the keyboard does to the viewport.
          "Anuluj" lives in the header so no footer competes for space. */}
      <DialogContent className="md:min-h-96" showCloseButton={false}>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
          <DialogHeader className="shrink-0 flex-row items-start justify-between text-left md:pr-4">
            <div className="flex flex-col gap-0.5">
              <DialogTitle>{title ?? (multi ? "Nowy obwód" : "Dodaj ćwiczenie")}</DialogTitle>
              <DialogDescription>
                {multi
                  ? "Zaznacz 2+ ćwiczeń — kolejność zaznaczania to kolejność w rundzie."
                  : 'Wyszukaj po nazwie PL lub aliasie (np. "siady", "martwy").'}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Anuluj
              </Button>
            </DialogClose>
          </DialogHeader>

          {open ? <ExercisePickerForm multi={multi} onPicked={onPicked} onPickedMany={onPickedMany} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExercisePickerForm({
  multi,
  onPicked,
  onPickedMany,
}: {
  multi: boolean;
  onPicked: (exerciseId: string) => Promise<void>;
  onPickedMany?: (exerciseIds: string[]) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchExercises>>>([]);
  const [searching, setSearching] = useState(false);
  // Per-row in-flight lock — without it, a user on flaky reception can
  // double-tap and create duplicate movement rows.
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Multi mode: selection survives searches (name kept for the chips row).
  const [selected, setSelected] = useState<{ id: string; namePl: string }[]>([]);

  // Monotonic counter: each search reserves a seq; after the await we apply the
  // result only if no newer search has started. On flaky networks an earlier,
  // shorter query can resolve LAST and overwrite the current results otherwise.
  const seqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(debounceRef.current ?? undefined), []);

  const handleSearch = (q: string) => {
    setQuery(q);
    setError(null);
    clearTimeout(debounceRef.current ?? undefined);
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++seqRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await searchExercises({ data: { query: q.trim() } });
        if (seq !== seqRef.current) return;
        setResults(rows);
        setSearching(false);
      } catch {
        if (seq !== seqRef.current) return;
        setSearching(false);
        setError("Wyszukiwanie nie powiodło się — spróbuj ponownie.");
      }
    }, 250);
  };

  const toggleSelected = (ex: { id: string; namePl: string }) => {
    setSelected((prev) =>
      prev.some((s) => s.id === ex.id)
        ? prev.filter((s) => s.id !== ex.id)
        : [...prev, { id: ex.id, namePl: ex.namePl }],
    );
  };

  const handlePick = async (ex: { id: string; namePl: string }) => {
    if (multi) {
      toggleSelected(ex);
      return;
    }
    setError(null);
    setPickingId(ex.id);
    try {
      await onPicked(ex.id);
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się dodać ćwiczenia."));
      setPickingId(null);
    }
  };

  const handleConfirmMany = async () => {
    if (!onPickedMany || selected.length < 2) return;
    setError(null);
    setPickingId("__many__");
    try {
      await onPickedMany(selected.map((s) => s.id));
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się dodać obwodu."));
      setPickingId(null);
    }
  };

  // Inline create (ADR-0020): the typed query becomes a new custom exercise
  // with sensible defaults — details are editable later on /exercises. In
  // multi mode the freshly created exercise joins the selection.
  const handleCreate = async () => {
    const namePl = query.trim();
    if (namePl.length === 0) return;
    setError(null);
    setPickingId("__create__");
    try {
      const created = await createExercise({
        data: {
          namePl,
          category: "ACCESSORY",
          defaultUnit: "REPS",
          isMainLift: false,
          isPrTracked: true,
          isLoadedBodyweight: false,
          aliases: [],
        },
      });
      if (multi) {
        toggleSelected({ id: created.id, namePl });
        setQuery("");
        setResults([]);
        setPickingId(null);
        return;
      }
      await onPicked(created.id);
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się utworzyć ćwiczenia."));
      setPickingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-3 px-4">
      <Input
        type="search"
        placeholder="Wyszukaj ćwiczenie..."
        className="shrink-0"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        maxLength={50}
        autoFocus
        disabled={pickingId !== null}
      />

      {multi && selected.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {selected.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-accent"
              onClick={() => toggleSelected(s)}
              aria-label={`Usuń z obwodu: ${s.namePl}`}
            >
              <span className="font-bold text-primary tabular-nums">{i + 1}.</span>
              <span className="max-w-32 truncate">{s.namePl}</span>
              <span className="text-muted-foreground">✕</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pb-[max(1rem,calc(env(safe-area-inset-bottom)-1rem))]">
        {searching && <li className="py-2 text-center text-muted-foreground text-xs">Szukam...</li>}
        {!searching && !error && query.trim().length >= 2 && results.length === 0 && (
          <li className="py-2 text-center text-muted-foreground text-xs">Brak wyników.</li>
        )}
        {results.map((ex) => {
          const selectionIndex = multi ? selected.findIndex((s) => s.id === ex.id) : -1;
          return (
            <li key={ex.id}>
              <button
                type="button"
                className={`flex w-full items-center justify-between rounded-md p-2 text-left text-sm hover:bg-accent disabled:opacity-50 ${
                  selectionIndex >= 0 ? "bg-accent" : ""
                }`}
                onClick={() => handlePick(ex)}
                disabled={pickingId !== null}
              >
                <div>
                  <p className="font-medium">{ex.namePl}</p>
                  <p className="text-muted-foreground text-xs">{EXERCISE_CATEGORY_LABEL[ex.category]}</p>
                </div>
                {pickingId === ex.id && <Spinner size="sm" className="text-muted-foreground" />}
                {selectionIndex >= 0 && (
                  <span className="font-bold text-primary text-sm tabular-nums">✓ {selectionIndex + 1}</span>
                )}
              </button>
            </li>
          );
        })}
        {/* Create only as the empty-state action — next to real matches it
            reads like "Dip isn't here yet" when it usually is. */}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <li>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md border border-dashed p-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
              onClick={handleCreate}
              disabled={pickingId !== null}
            >
              <div>
                <p className="font-medium text-primary">+ Dodaj „{query.trim()}”</p>
                <p className="text-muted-foreground text-xs">nowe ćwiczenie — szczegóły uzupełnisz w Ćwiczeniach</p>
              </div>
              {pickingId === "__create__" && <Spinner size="sm" className="text-muted-foreground" />}
            </button>
          </li>
        )}
      </ul>

      {multi && (
        <div className="shrink-0 pb-[max(1rem,calc(env(safe-area-inset-bottom)-1rem))]">
          <Button
            type="button"
            className="w-full bg-ember shadow-ember"
            size="lg"
            disabled={selected.length < 2 || pickingId !== null}
            onClick={handleConfirmMany}
          >
            {pickingId === "__many__"
              ? "Dodaję..."
              : selected.length < 2
                ? "Zaznacz co najmniej 2 ćwiczenia"
                : `Dodaj obwód (${selected.length})`}
          </Button>
        </div>
      )}
    </div>
  );
}
