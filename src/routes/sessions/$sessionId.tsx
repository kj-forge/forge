import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Spinner } from "@/components/spinner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { getSession } from "@/lib/session";
import {
  addExerciseToSession,
  addSet,
  deleteSession,
  deleteSet,
  endSession,
  getSessionDetails,
  removeExerciseFromSession,
  searchExercises,
  updateSessionNotes,
} from "@/lib/strength";

const SET_KINDS = ["WARMUP", "TOP_SET", "WORK", "BACK_OFF", "FAILURE", "DROP_SET"] as const;
type SetKind = (typeof SET_KINDS)[number];

const SET_KIND_LABEL: Record<SetKind, string> = {
  WARMUP: "🔥 Rozgrzewka",
  TOP_SET: "⭐ Top set",
  WORK: "• Robocza",
  BACK_OFF: "💪 Back-off",
  FAILURE: "⚠️ Do upadku",
  DROP_SET: "↘ Drop set",
};

const SET_KIND_COLOR: Record<SetKind, string> = {
  WARMUP: "text-muted-foreground",
  TOP_SET: "text-orange-600 dark:text-orange-400",
  WORK: "text-foreground",
  BACK_OFF: "text-emerald-600 dark:text-emerald-400",
  FAILURE: "text-red-600 dark:text-red-400",
  DROP_SET: "text-purple-600 dark:text-purple-400",
};

export const Route = createFileRoute("/sessions/$sessionId")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: ({ params }) => getSessionDetails({ data: { sessionId: params.sessionId } }),
  component: ActiveSessionPage,
});

type SessionDetails = Awaited<ReturnType<typeof getSessionDetails>>;
type Movement = SessionDetails["movements"][number];
type SetRow = Movement["sets"][number];

function ActiveSessionPage() {
  const { session, movements } = Route.useLoaderData();
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

      {/* Notes preview (shown after end; tap edit to reopen drawer) */}
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
          setPickerOpen(false);
          router.invalidate();
        }}
      />

      <NotesDrawer
        open={notesOpen}
        onOpenChange={setNotesOpen}
        initialNotes={session.notes ?? ""}
        onSave={async (notes) => {
          await updateSessionNotes({ data: { sessionId: session.id, notes } });
          setNotesOpen(false);
          router.invalidate();
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
          setEndOpen(false);
          router.invalidate();
        }}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Movement row + exercise drawer
// ─────────────────────────────────────────────────────────────────────────────

function MovementRow({ movement, isEnded }: { movement: Movement; isEnded: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const workSets = movement.sets.filter((s) => s.kind !== "WARMUP");
  const warmupSets = movement.sets.filter((s) => s.kind === "WARMUP");

  // Active session + empty movement: show the inline ✕ for quick removal
  // (mid-workout the user may have added an exercise they no longer want).
  // Ended session + empty movement: removal lives inside the view-only drawer
  // instead, since cleanup of vestigial movements is a less frequent flow.
  const canRemoveInline = !isEnded && movement.sets.length === 0;

  const handleRemove = async () => {
    setRemoveError(null);
    setRemoving(true);
    try {
      await removeExerciseFromSession({ data: { blockMovementId: movement.id } });
      router.invalidate();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Nie udało się usunąć ćwiczenia.");
      setRemoving(false);
    }
  };

  const statusText =
    movement.sets.length === 0 ? "Pusta" : `${workSets.length} ${workSets.length === 1 ? "seria" : "serii"}`;
  const statusClass = movement.sets.length === 0 ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400";

  return (
    <>
      {/* Sibling-button layout: the main card and the delete ✕ are two
          separate <button>s side by side (not nested — that would be
          invalid HTML and would steal the card's tap target). */}
      <div className="flex items-stretch gap-1">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(true)}>
          <Card className="transition-colors hover:bg-accent/50">
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate font-medium text-sm">{movement.exerciseNamePl}</p>
                <span className={`w-20 shrink-0 text-right text-xs ${statusClass}`}>{statusText}</span>
              </div>
              {movement.sets.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-x-2 text-xs">
                  {warmupSets.length > 0 && (
                    <span className="text-muted-foreground">🔥 {warmupSets.map(formatSet).join(" · ")}</span>
                  )}
                  {workSets.map((s, i) => (
                    <span key={s.id} className={SET_KIND_COLOR[s.kind as SetKind]}>
                      {i === 0 ? "" : "· "}
                      {formatSet(s)}
                    </span>
                  ))}
                </p>
              )}
            </CardContent>
          </Card>
        </button>

        {canRemoveInline && (
          <button
            type="button"
            className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            onClick={handleRemove}
            disabled={removing}
            aria-label={`Usuń ćwiczenie ${movement.exerciseNamePl}`}
          >
            {removing ? <Spinner size="sm" /> : "✕"}
          </button>
        )}
      </div>

      {removeError && (
        <p className="mt-1 px-1 text-destructive text-xs" role="alert">
          {removeError}
        </p>
      )}

      {isEnded ? (
        <ViewOnlyExerciseDrawer open={open} onOpenChange={setOpen} movement={movement} />
      ) : (
        <ExerciseDrawer open={open} onOpenChange={setOpen} movement={movement} />
      )}
    </>
  );
}

function formatSet(s: SetRow): string {
  const reps = s.reps ?? "–";
  const weight = s.weightKg !== null ? `${s.weightKg}kg` : "bw";
  return `${reps}×${weight}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise drawer — set logging
// ─────────────────────────────────────────────────────────────────────────────

interface ExerciseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movement: Movement;
}

function ExerciseDrawer({ open, onOpenChange, movement }: ExerciseDrawerProps) {
  const router = useRouter();
  const lastSet = movement.sets[movement.sets.length - 1];
  const lastWorkSet = [...movement.sets].reverse().find((s) => s.kind !== "WARMUP");

  // Default precedence for the FIRST set of an exercise:
  //   1. Last set in THIS session (carry-over within the workout)
  //   2. movement.targetReps / targetWeightKg — cloned from the previous
  //      session's last set when the user picked "Z poprzedniej sesji"
  //   3. Hard fallback (5 reps × 0 kg) for brand-new exercises with no history
  const defaultReps = lastSet?.reps ?? movement.targetReps ?? 5;
  const defaultWeight = lastSet?.weightKg ?? movement.targetWeightKg ?? 0;

  // Auto-detect kind heuristic.
  const suggestKind = (): SetKind => {
    if (movement.sets.length === 0) return "WORK";
    if (lastWorkSet && lastSet) {
      // After a TOP_SET, suggest BACK_OFF if weight goes down.
      if (
        lastWorkSet.kind === "TOP_SET" &&
        lastSet.weightKg !== null &&
        (lastSet.weightKg ?? 0) < (lastWorkSet.weightKg ?? 0)
      ) {
        return "BACK_OFF";
      }
    }
    return (lastSet?.kind as SetKind | undefined) ?? "WORK";
  };

  // String state for inputs so the user can clear the field with backspace
  // without React snapping back to a "0" placeholder. Parse on submit.
  // State persists across opens (carry-over UX) — typical strength training
  // pattern is N identical sets, so defaults from last logged set save taps.
  const [reps, setReps] = useState<string>(String(defaultReps));
  const [weight, setWeight] = useState<string>(String(defaultWeight));
  const [rpe, setRpe] = useState<number | null>(null);
  const [kind, setKind] = useState<SetKind>(suggestKind());
  const [saving, setSaving] = useState(false);
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Active-session drawer is intentionally focused on logging only — exercise
  // removal lives on the card itself (inline ✕). Keeping destructive actions
  // out of the form here removes the accidental-tap risk during a set.

  // Derived numeric values used by steppers + submit. NaN if input is empty
  // or invalid — guards against silent "0" payloads.
  const repsNum = Number.parseInt(reps, 10);
  const weightNum = Number.parseFloat(weight);

  const bumpReps = (delta: number) => {
    const base = Number.isNaN(repsNum) ? 0 : repsNum;
    setReps(String(Math.max(0, base + delta)));
  };
  const bumpWeight = (delta: number) => {
    const base = Number.isNaN(weightNum) ? 0 : weightNum;
    setWeight(String(Math.max(0, Math.round((base + delta) * 10) / 10)));
  };

  // Pure business logic — no DOM event. The form's onSubmit calls
  // preventDefault inline (contextual typing for `e`), then invokes this.
  // React 19's @types/react deprecates the named `FormEvent` / `FormEventHandler`
  // types, so we keep the event-handling concern out of the function signature.
  const submitSet = async () => {
    setError(null);
    if (Number.isNaN(repsNum) || repsNum < 0) {
      setError("Podaj liczbę powtórzeń.");
      return;
    }
    setSaving(true);
    try {
      await addSet({
        data: {
          blockMovementId: movement.id,
          reps: repsNum,
          weightKg: !Number.isNaN(weightNum) && weightNum > 0 ? weightNum : undefined,
          rpe: rpe ?? undefined,
          kind,
        },
      });
      setRpe(null);
      router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się zapisać serii.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSet = async (setId: string) => {
    setError(null);
    setDeletingSetId(setId);
    try {
      await deleteSet({ data: { setId } });
      router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się usunąć serii.");
    } finally {
      setDeletingSetId(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>{movement.exerciseNamePl}</DrawerTitle>
            <DrawerDescription>
              {movement.sets.length === 0
                ? "Pierwsza seria"
                : `${movement.sets.length} ${movement.sets.length === 1 ? "seria" : "serii"} w tej sesji`}
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4 px-4">
            {/* Previous sets summary */}
            {movement.sets.length > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 text-xs">
                <p className="mb-1 font-medium">📊 W tej sesji:</p>
                <ul className="space-y-0.5">
                  {movement.sets.map((s, i) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span className={SET_KIND_COLOR[s.kind as SetKind]}>
                        {i + 1}. {SET_KIND_LABEL[s.kind as SetKind]} · {formatSet(s)}
                        {s.rpe !== null && ` · RPE ${s.rpe}`}
                      </span>
                      <button
                        type="button"
                        className="text-muted-foreground text-xs hover:text-destructive disabled:opacity-50"
                        onClick={() => handleDeleteSet(s.id)}
                        disabled={deletingSetId === s.id}
                        aria-label={`Usuń serię ${i + 1}`}
                      >
                        {deletingSetId === s.id ? "..." : "✕"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                submitSet();
              }}
            >
              {/* Kind chips */}
              <div className="space-y-1.5">
                <Label>Typ serii</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {SET_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                        kind === k
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                      onClick={() => setKind(k)}
                    >
                      {SET_KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reps stepper */}
              <div className="space-y-1.5">
                <Label htmlFor="reps">Powtórzenia</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="lg" onClick={() => bumpReps(-1)}>
                    −
                  </Button>
                  <Input
                    id="reps"
                    type="number"
                    inputMode="numeric"
                    className="text-center text-lg"
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                  />
                  <Button type="button" variant="outline" size="lg" onClick={() => bumpReps(1)}>
                    +
                  </Button>
                </div>
              </div>

              {/* Weight stepper */}
              <div className="space-y-1.5">
                <Label htmlFor="weight">Ciężar (kg)</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="lg" onClick={() => bumpWeight(-2.5)}>
                    −2.5
                  </Button>
                  <Input
                    id="weight"
                    type="number"
                    inputMode="decimal"
                    step={2.5}
                    className="text-center text-lg"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                  <Button type="button" variant="outline" size="lg" onClick={() => bumpWeight(2.5)}>
                    +2.5
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">0 = bodyweight</p>
              </div>

              {/* RPE optional */}
              <div className="space-y-1.5">
                <Label>RPE (opcjonalne)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[6, 7, 8, 9, 10].map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                        rpe === v
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                      onClick={() => setRpe(rpe === v ? null : v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={saving}>
                {saving ? "Zapisuję..." : `⚡ Zapisz serię (${SET_KIND_LABEL[kind].replace(/^\S+\s/, "")})`}
              </Button>
            </form>
          </div>

          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">Zamknij</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// View-only exercise drawer (for ended sessions) — sets grouped by kind
// ─────────────────────────────────────────────────────────────────────────────

// The visual order we want kinds shown in (matches a typical session flow:
// warm up → top → working → back off → tail).
const SET_KIND_DISPLAY_ORDER: SetKind[] = ["WARMUP", "TOP_SET", "WORK", "BACK_OFF", "FAILURE", "DROP_SET"];

function ViewOnlyExerciseDrawer({
  open,
  onOpenChange,
  movement,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movement: Movement;
}) {
  const router = useRouter();
  const [removingExercise, setRemovingExercise] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group sets by kind, preserving each set's setNumber for stable display.
  const grouped = SET_KIND_DISPLAY_ORDER.map((kind) => ({
    kind,
    sets: movement.sets.filter((s) => s.kind === kind),
  })).filter((g) => g.sets.length > 0);

  // Even an ended session can have an empty (never-logged) movement — let the
  // user clean it up from inside the drawer. Server still guards on
  // COUNT(sets) = 0 so a stale client can't bypass.
  const canRemoveExercise = movement.sets.length === 0;
  const handleRemoveExercise = async () => {
    setError(null);
    setRemovingExercise(true);
    try {
      await removeExerciseFromSession({ data: { blockMovementId: movement.id } });
      onOpenChange(false);
      router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się usunąć ćwiczenia.");
      setRemovingExercise(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>{movement.exerciseNamePl}</DrawerTitle>
            <DrawerDescription>
              {movement.sets.length === 0
                ? "Brak zalogowanych serii"
                : `${movement.sets.length} ${movement.sets.length === 1 ? "seria" : "serii"} · podsumowanie`}
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4 px-4">
            {grouped.length === 0 ? (
              <p className="rounded-lg bg-muted/50 p-3 text-center text-muted-foreground text-sm">
                To ćwiczenie zostało dodane do sesji, ale nie zalogowano żadnej serii.
              </p>
            ) : (
              grouped.map((g) => (
                <section key={g.kind} className="space-y-1.5">
                  <h3 className={`font-medium text-xs ${SET_KIND_COLOR[g.kind]}`}>{SET_KIND_LABEL[g.kind]}</h3>
                  <ul className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
                    {g.sets.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground text-xs">#{s.setNumber}</span>
                        <span className="flex-1 text-center">{formatSet(s)}</span>
                        <span className="w-12 text-right text-muted-foreground text-xs">
                          {s.rpe !== null ? `RPE ${s.rpe}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
          </div>

          <DrawerFooter className="gap-2">
            {canRemoveExercise && (
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                disabled={removingExercise}
                onClick={handleRemoveExercise}
              >
                {removingExercise ? <Spinner size="sm" /> : "Usuń ćwiczenie z sesji"}
              </Button>
            )}
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">
                Zamknij
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise picker drawer
// ─────────────────────────────────────────────────────────────────────────────

interface ExercisePickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: (exerciseId: string) => Promise<void>;
}

// The drawer shell is always mounted (Vaul controls visibility). The
// SEARCH FORM, however, is conditionally rendered — when `open` flips to
// false the form unmounts, taking its query/results state with it.
// On the next open, the form mounts fresh — no `useEffect`-driven reset
// required. Pure-declarative React: state lives where the component lives.
function ExercisePickerDrawer({ open, onOpenChange, onPicked }: ExercisePickerDrawerProps) {
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
  // Per-row in-flight state: while we wait for addExerciseToSession to resolve,
  // disable EVERY row + show a spinner on the tapped one. Without this lock a
  // user on flaky reception can double-tap and create duplicate movement rows
  // (no server-side idempotency yet).
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const rows = await searchExercises({ data: { query: q.trim() } });
      setResults(rows);
    } finally {
      setSearching(false);
    }
  };

  const handlePick = async (exerciseId: string) => {
    setError(null);
    setPickingId(exerciseId);
    try {
      await onPicked(exerciseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się dodać ćwiczenia.");
      setPickingId(null);
    }
    // On success: parent closes the drawer + invalidates, this component
    // unmounts (conditional child), so we don't need to clear pickingId here.
  };

  return (
    <div className="space-y-3 px-4">
      <Input
        type="search"
        placeholder="Wyszukaj ćwiczenie..."
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
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
        {!searching && query.trim().length >= 2 && results.length === 0 && (
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

// ─────────────────────────────────────────────────────────────────────────────
// End session drawer
// ─────────────────────────────────────────────────────────────────────────────

interface EndSessionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movementCount: number;
  onConfirm: (notes?: string) => Promise<void>;
}

function EndSessionDrawer({ open, onOpenChange, movementCount, onConfirm }: EndSessionDrawerProps) {
  const [notes, setNotes] = useState("");
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>Zakończ sesję?</DrawerTitle>
            <DrawerDescription>
              {movementCount} {movementCount === 1 ? "ćwiczenie" : "ćwiczeń"}
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-3 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notatki (opcjonalne)</Label>
              <textarea
                id="notes"
                className="min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm"
                placeholder="Wnioski z dzisiejszego treningu..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
          </div>

          <DrawerFooter className="gap-2">
            <Button
              className="w-full"
              disabled={ending}
              onClick={async () => {
                setError(null);
                setEnding(true);
                try {
                  await onConfirm(notes.trim() || undefined);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Nie udało się zakończyć sesji.");
                } finally {
                  setEnding(false);
                }
              }}
            >
              {ending ? "Zakańczam..." : "Zakończ i zapisz"}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">
                Anuluj
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Notes drawer — re-openable after end-of-session for edit-only-notes flow
// ─────────────────────────────────────────────────────────────────────────────

interface NotesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialNotes: string;
  onSave: (notes: string) => Promise<void>;
}

// Conditional child pattern — the form mounts fresh each time the drawer
// opens, so we never need to manually reset `notes` from `initialNotes`
// (the previous render-phase setState was a known React anti-pattern).
function NotesDrawer({ open, onOpenChange, initialNotes, onSave }: NotesDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>Notatki sesji</DrawerTitle>
            <DrawerDescription>Wnioski, samopoczucie, plan na następny trening.</DrawerDescription>
          </DrawerHeader>

          {open ? <NotesForm initialNotes={initialNotes} onSave={onSave} /> : null}

          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">
                Anuluj
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function NotesForm({ initialNotes, onSave }: { initialNotes: string; onSave: (notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3 px-4">
      <textarea
        className="min-h-32 w-full rounded-md border border-border bg-background p-2 text-sm"
        placeholder="Wnioski z dzisiejszego treningu..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Button
        className="w-full"
        disabled={saving}
        onClick={async () => {
          setError(null);
          setSaving(true);
          try {
            await onSave(notes);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Nie udało się zapisać notatek.");
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Zapisuję..." : "Zapisz notatki"}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete confirm drawer
// ─────────────────────────────────────────────────────────────────────────────

interface DeleteSessionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEnded: boolean;
  onConfirm: () => Promise<void>;
}

function DeleteSessionDrawer({ open, onOpenChange, isEnded, onConfirm }: DeleteSessionDrawerProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>⚠️ Usunąć sesję?</DrawerTitle>
            <DrawerDescription>
              {isEnded
                ? "Sesja zostanie nieodwracalnie usunięta wraz ze wszystkimi seriami."
                : "Sesja jest w trakcie. Usunięcie skasuje całość — nie da się tego cofnąć."}
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4">
            {error && (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
          </div>

          <DrawerFooter className="gap-2">
            <Button
              variant="destructive"
              className="w-full"
              disabled={deleting}
              onClick={async () => {
                setError(null);
                setDeleting(true);
                try {
                  await onConfirm();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Nie udało się usunąć sesji.");
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Usuwam..." : "Tak, usuń"}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">
                Anuluj
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
