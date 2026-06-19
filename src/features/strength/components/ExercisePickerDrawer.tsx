import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { searchExercises } from "@/features/strength/server/exercises";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

interface ExercisePickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: (exerciseId: string) => Promise<void>;
}

// The drawer shell is always mounted (Vaul controls visibility). The search
// form, however, is conditionally rendered — when `open` flips to false the
// form unmounts, taking its query/results state with it. On the next open
// the form mounts fresh — no `useEffect`-driven reset required.
export function ExercisePickerDrawer({ open, onOpenChange, onPicked }: ExercisePickerDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>Dodaj ćwiczenie</DrawerTitle>
            <DrawerDescription>Wyszukaj po nazwie PL lub aliasie (np. "siady", "martwy").</DrawerDescription>
          </DrawerHeader>

          {open ? <ExercisePickerForm onPicked={onPicked} /> : null}

          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">Anuluj</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
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
    <div className="space-y-3 px-4">
      <Input
        type="search"
        placeholder="Wyszukaj ćwiczenie..."
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

      <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
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
