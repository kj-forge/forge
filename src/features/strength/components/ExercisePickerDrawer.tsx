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
import { searchExercises } from "@/features/strength/server/exercises";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

interface ExercisePickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: (exerciseId: string) => Promise<void>;
}

// The drawer shell is always mounted. The search form, however, is
// conditionally rendered — when `open` flips to false the form unmounts,
// taking its query/results state with it. On the next open the form mounts
// fresh — no `useEffect`-driven reset required.
export function ExercisePickerDrawer({ open, onOpenChange, onPicked }: ExercisePickerDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Full-screen on mobile: with the input pinned near the top of the
          screen it stays visible regardless of what the keyboard does to the
          viewport — we don't depend on vaul's reposition math (flaky on iOS 26).
          "Anuluj" lives in the header so no footer competes for space. */}
      <DialogContent
        className="h-dvh pt-[env(safe-area-inset-top)] data-[vaul-drawer-direction=bottom]:max-h-none md:h-auto md:min-h-96"
        showCloseButton={false}
      >
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
          <DialogHeader className="shrink-0 flex-row items-start justify-between text-left md:pr-4">
            <div className="flex flex-col gap-0.5">
              <DialogTitle>Dodaj ćwiczenie</DialogTitle>
              <DialogDescription>Wyszukaj po nazwie PL lub aliasie (np. "siady", "martwy").</DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Anuluj
              </Button>
            </DialogClose>
          </DialogHeader>

          {open ? <ExercisePickerForm onPicked={onPicked} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExercisePickerForm({ onPicked }: { onPicked: (exerciseId: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchExercises>>>([]);
  const [searching, setSearching] = useState(false);
  // Per-row in-flight lock — without it, a user on flaky reception can
  // double-tap and create duplicate movement rows.
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handlePick = async (exerciseId: string) => {
    setError(null);
    setPickingId(exerciseId);
    try {
      await onPicked(exerciseId);
    } catch (err) {
      setError(getErrorMessage(err, "Nie udało się dodać ćwiczenia."));
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
        {results.map((ex) => (
          <li key={ex.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md p-2 text-left text-sm hover:bg-accent disabled:opacity-50"
              onClick={() => handlePick(ex.id)}
              disabled={pickingId !== null}
            >
              <div>
                <p className="font-medium">{ex.namePl}</p>
                <p className="text-muted-foreground text-xs">
                  {ex.nameEn} · {ex.category}
                </p>
              </div>
              {pickingId === ex.id && <Spinner size="sm" className="text-muted-foreground" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
