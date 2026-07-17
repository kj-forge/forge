import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import { Flame, ListChecks, Zap } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { NumericFormat } from "react-number-format";
import { toast } from "sonner";

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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExerciseNav } from "@/features/strength/components/ExerciseNav";
import { SET_KIND_COLOR, SET_KIND_LABEL, VISIBLE_SET_KINDS } from "@/features/strength/constants";
import { fireConfetti } from "@/features/strength/lib/confetti";
import { formatSet } from "@/features/strength/lib/format-set";
import { formatSetsCompactParts } from "@/features/strength/lib/format-sets-compact";
import { seedSetFields } from "@/features/strength/lib/seed-set-fields";
import {
  numToInputStr,
  type SetFormInput,
  type SetFormValues,
  setFormSchema,
  stepReps,
  stepWeight,
} from "@/features/strength/lib/set-form";
import { suggestKind } from "@/features/strength/lib/suggest-kind";
import { addSet, deleteSet } from "@/features/strength/server/sets";
import type { Movement, SetKind } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

const LAST_SESSION_DATE_FMT = new Intl.DateTimeFormat("pl-PL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

interface ExerciseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Null while closed (the drawer is rendered once at the view level and the
  // open movement is selected by id) — the body only mounts when non-null.
  movement: Movement | null;
  movements: Movement[];
  onNavigate: (id: string) => void;
}

export function ExerciseDrawer({ open, onOpenChange, movement, movements, onNavigate }: ExerciseDrawerProps) {
  // key={movement.id}: switching exercise while the drawer stays open remounts
  // the body so the set form re-seeds from the new movement (this session's
  // latest set of the kind first, then the historical lastByKind reference).
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && movement ? (
          <ExerciseDrawerBody key={movement.id} movement={movement} movements={movements} onNavigate={onNavigate} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ExerciseDrawerBody({
  movement,
  movements,
  onNavigate,
}: {
  movement: Movement;
  movements: Movement[];
  onNavigate: (id: string) => void;
}) {
  const router = useRouter();

  const initialKind = suggestKind(movement);
  const initialFields = seedSetFields(movement.sets, movement.lastByKind, initialKind) ?? {
    reps: undefined,
    weightKg: undefined,
  };

  const form = useForm<SetFormInput, unknown, SetFormValues>({
    resolver: zodResolver(setFormSchema),
    defaultValues: {
      kind: initialKind,
      reps: numToInputStr(initialFields.reps),
      weightKg: numToInputStr(initialFields.weightKg),
      rpe: null,
    },
    mode: "onSubmit",
  });

  // Set deletion is outside the form (per-row destructive action). Keep its
  // own local state — no try/finally so React Compiler can memoize.
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit(async (values) => {
    const weightKg = values.weightKg > 0 ? values.weightKg : undefined;
    const rpe = values.rpe ?? undefined;
    try {
      const saved = await addSet({
        data: {
          blockMovementId: movement.id,
          reps: values.reps,
          weightKg,
          rpe,
          kind: values.kind,
        },
      });
      await router.invalidate();
      if (saved.pr?.isNewPR && weightKg !== undefined) {
        // Real bar weight only — estimates live on the stats page.
        const plus = movement.exerciseIsLoadedBodyweight ? "+" : "";
        const prev = saved.pr.previousBest;
        fireConfetti();
        toast(`Nowy rekord: ${movement.exerciseNamePl}!`, {
          description: `${values.reps}× ${plus}${weightKg} kg (było ${prev.reps}× ${plus}${prev.weightKg} kg)`,
          icon: <Flame className="size-5 text-primary" />,
          className: "shadow-ember",
        });
      }
      // Carry-over for the next set: keep kind/reps/weight, clear RPE only.
      form.reset({
        kind: values.kind,
        reps: numToInputStr(values.reps),
        weightKg: numToInputStr(values.weightKg),
        rpe: null,
      });
    } catch (err) {
      form.setError("root.serverError", {
        type: "server",
        message: getErrorMessage(err, "Nie udało się zapisać serii."),
      });
    }
  });

  const handleDeleteSet = async (setId: string) => {
    setDeleteError(null);
    setDeletingSetId(setId);
    try {
      await deleteSet({ data: { setId } });
      await router.invalidate();
      setDeletingSetId(null);
    } catch (err) {
      setDeleteError(getErrorMessage(err, "Nie udało się usunąć serii."));
      setDeletingSetId(null);
    }
  };

  // Switching kind pre-fills that kind's latest set from this session, falling
  // back to the last-session reference; if neither exists, the current inputs
  // stay as the athlete left them.
  const handleKindChange = (k: SetKind) => {
    form.setValue("kind", k);
    const seed = seedSetFields(movement.sets, movement.lastByKind, k);
    if (!seed) return;
    form.setValue("reps", numToInputStr(seed.reps));
    form.setValue("weightKg", numToInputStr(seed.weightKg ?? 0));
  };

  const isSubmitting = form.formState.isSubmitting;
  const currentKind = useWatch({ control: form.control, name: "kind" });

  // Mid-workout memory: what this exercise looked like last time, in the
  // notebook notation — no trip to history needed. Warmups excluded.
  const lastParts = movement.lastSession
    ? formatSetsCompactParts(movement.lastSession.sets, { loadedBodyweight: movement.exerciseIsLoadedBodyweight })
    : [];

  return (
    <Form {...form}>
      <form className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden" onSubmit={onSubmit} noValidate>
        <DialogHeader className="shrink-0">
          <DialogTitle>{movement.exerciseNamePl}</DialogTitle>
          <DialogDescription>
            {movement.sets.length === 0
              ? "Pierwsza seria"
              : `${movement.sets.length} ${movement.sets.length === 1 ? "seria" : "serii"} w tej sesji`}
          </DialogDescription>
        </DialogHeader>

        {movement.lastSession && lastParts.length > 0 && (
          <div className="shrink-0 px-4 pb-1">
            <div className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
              <span className="font-medium text-muted-foreground">
                Ostatnio · {LAST_SESSION_DATE_FMT.format(new Date(movement.lastSession.date))}:{" "}
              </span>
              <span className="tabular-nums">
                {lastParts.map((p, i) => (
                  <span key={`${p.weight}-${p.reps}`}>
                    {i > 0 && <span className="text-muted-foreground"> · </span>}
                    {p.weight !== null && <b className="font-semibold">{p.weight} </b>}
                    <span className="text-muted-foreground">{p.reps}</span>
                  </span>
                ))}
              </span>
            </div>
          </div>
        )}

        <div className="shrink-0 px-4 pt-1 pb-2">
          <ExerciseNav movements={movements} currentId={movement.id} onNavigate={onNavigate} />
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
          {movement.sets.length > 0 && (
            <div className="rounded-lg bg-muted/50 p-3 text-xs">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <ListChecks className="size-3.5 text-primary" />W tej sesji:
              </p>
              <ul className="space-y-0.5">
                {movement.sets.map((s, i) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className={SET_KIND_COLOR[s.kind as SetKind]}>
                      {i + 1}. {SET_KIND_LABEL[s.kind as SetKind]} · {formatSet(s)}
                      {s.rpe !== null && ` · RPE ${s.rpe}`}
                    </span>
                    <button
                      type="button"
                      className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground text-xs hover:text-destructive disabled:opacity-50"
                      onClick={() => handleDeleteSet(s.id)}
                      disabled={deletingSetId === s.id}
                      aria-label={`Usuń serię ${i + 1}`}
                    >
                      {deletingSetId === s.id ? <Spinner size="sm" /> : "✕"}
                    </button>
                  </li>
                ))}
              </ul>
              {deleteError && (
                <p className="mt-2 text-destructive" role="alert">
                  {deleteError}
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {/* Kind chips */}
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Typ serii</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-3 gap-1.5">
                      {VISIBLE_SET_KINDS.map((k) => (
                        <button
                          key={k}
                          type="button"
                          className={`rounded-md border px-2 py-1.5 font-semibold text-xs transition-colors ${
                            field.value === k
                              ? "border-transparent bg-ember"
                              : "border-border text-muted-foreground hover:bg-accent"
                          }`}
                          onClick={() => handleKindChange(k)}
                        >
                          {SET_KIND_LABEL[k]}
                        </button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Reps stepper */}
            <Controller
              control={form.control}
              name="reps"
              render={({ field, fieldState }) => (
                <div className="space-y-1.5">
                  <Label htmlFor="reps">Powtórzenia</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => field.onChange(stepReps(field.value, -1))}
                    >
                      −
                    </Button>
                    <NumericFormat
                      id="reps"
                      customInput={Input}
                      className="text-center font-extrabold text-xl tabular-nums"
                      value={field.value}
                      valueIsNumericString
                      onValueChange={(values) => field.onChange(values.value)}
                      decimalScale={0}
                      allowNegative={false}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => field.onChange(stepReps(field.value, 1))}
                    >
                      +
                    </Button>
                  </div>
                  {fieldState.error && (
                    <p className="text-destructive text-xs" role="alert">
                      {fieldState.error.message}
                    </p>
                  )}
                </div>
              )}
            />

            {/* Weight stepper */}
            <Controller
              control={form.control}
              name="weightKg"
              render={({ field, fieldState }) => (
                <div className="space-y-1.5">
                  <Label htmlFor="weight">Ciężar (kg)</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => field.onChange(stepWeight(field.value, -2.5))}
                    >
                      −2.5
                    </Button>
                    <NumericFormat
                      id="weight"
                      customInput={Input}
                      className="text-center font-extrabold text-primary text-xl tabular-nums"
                      value={field.value}
                      valueIsNumericString
                      onValueChange={(values) => field.onChange(values.value)}
                      decimalScale={2}
                      allowNegative={false}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => field.onChange(stepWeight(field.value, 2.5))}
                    >
                      +2.5
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">0 = bodyweight</p>
                  {fieldState.error && (
                    <p className="text-destructive text-xs" role="alert">
                      {fieldState.error.message}
                    </p>
                  )}
                </div>
              )}
            />

            {/* RPE optional */}
            <Controller
              control={form.control}
              name="rpe"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <Label>RPE (opcjonalne)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {[6, 7, 8, 9, 10].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`rounded-md border px-3 py-1 font-semibold text-sm transition-colors ${
                          field.value === v
                            ? "border-primary text-primary"
                            : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                        onClick={() => field.onChange(field.value === v ? null : v)}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            />

            <FormRootMessage />
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2">
          <Button type="submit" className="w-full bg-ember shadow-ember" size="lg" disabled={isSubmitting}>
            {isSubmitting ? (
              "Zapisuję..."
            ) : (
              <>
                <Zap className="size-4" />
                Zapisz serię ({SET_KIND_LABEL[currentKind]})
              </>
            )}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="w-full">
              Zamknij
            </Button>
          </DialogClose>
        </DialogFooter>
      </form>
    </Form>
  );
}
