import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PLAN_INTENSITIES, PLAN_INTENSITY_LABEL } from "@/features/plan/constants";
import { type PlanDayFormValues, planDayFormSchema } from "@/features/plan/lib/plan-day-form";
import { upsertPlanDay } from "@/features/plan/server/plan";
import type { PlanDay } from "@/features/plan/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";
import { WEEKDAY_FULL_PL } from "@/shared/lib/weekday";

export type PlanEditing = { day: number; serial: boolean };

type ExerciseOption = { id: string; namePl: string };

interface PlanDayDrawerProps {
  editing: PlanEditing | null;
  byDay: Map<number, PlanDay>;
  allExercises: ExerciseOption[];
  onClose: () => void;
  onAdvance: (nextDay: number) => void;
}

export function PlanDayDrawer({ editing, byDay, allExercises, onClose, onAdvance }: PlanDayDrawerProps) {
  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {editing ? (
          // key re-mounts the body per day, so serial advancing re-seeds the
          // form from the next day's data instead of dragging values along.
          <PlanDayDrawerBody
            key={editing.day}
            editing={editing}
            entry={byDay.get(editing.day)}
            allExercises={allExercises}
            onClose={onClose}
            onAdvance={onAdvance}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PlanDayDrawerBody({
  editing,
  entry,
  allExercises,
  onClose,
  onAdvance,
}: {
  editing: PlanEditing;
  entry: PlanDay | undefined;
  allExercises: ExerciseOption[];
  onClose: () => void;
  onAdvance: (nextDay: number) => void;
}) {
  const router = useRouter();
  const form = useForm<PlanDayFormValues>({
    resolver: zodResolver(planDayFormSchema),
    defaultValues: {
      intensity: entry?.intensity ?? "MEDIUM",
      training: entry?.training ?? "",
      goal: entry?.goal ?? "",
    },
    mode: "onSubmit",
  });

  // Strength toggle + ordered exercise list live outside RHF (an ordered list
  // is awkward as a field array); merged into the payload at save.
  const [hasStrength, setHasStrength] = useState(entry?.hasStrength ?? false);
  const [picked, setPicked] = useState<{ exerciseId: string; namePl: string }[]>(entry?.exercises ?? []);
  const [query, setQuery] = useState("");

  const addExercise = (e: ExerciseOption) => {
    setPicked((prev) =>
      prev.some((p) => p.exerciseId === e.id) ? prev : [...prev, { exerciseId: e.id, namePl: e.namePl }],
    );
    setQuery("");
  };
  const removeExercise = (id: string) => setPicked((prev) => prev.filter((p) => p.exerciseId !== id));
  const moveExercise = (i: number, dir: -1 | 1) =>
    setPicked((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const q = query.trim().toLowerCase();
  const matches = q
    ? allExercises
        .filter((e) => !picked.some((p) => p.exerciseId === e.id) && e.namePl.toLowerCase().includes(q))
        .slice(0, 8)
    : [];

  // Strength edits are outside RHF, so factor them into the back-nav guard.
  const strengthDirty =
    hasStrength !== (entry?.hasStrength ?? false) ||
    picked.length !== (entry?.exercises.length ?? 0) ||
    picked.some((p, i) => p.exerciseId !== entry?.exercises[i]?.exerciseId);

  const isLast = editing.day === 6;

  const save = async (values: PlanDayFormValues, goTo: number | "close") => {
    try {
      await upsertPlanDay({
        data: {
          dayOfWeek: editing.day,
          intensity: values.intensity,
          training: values.training,
          goal: values.goal || undefined,
          hasStrength,
          exerciseIds: picked.map((p) => p.exerciseId),
        },
      });
      await router.invalidate();
      if (goTo === "close") onClose();
      else onAdvance(goTo);
    } catch (err) {
      form.setError("root.serverError", {
        type: "server",
        message: getErrorMessage(err, "Nie udało się zapisać dnia."),
      });
    }
  };

  // Backing up mid-wizard must never lose typing: a dirty form (or changed
  // strength list) saves first, a clean one just switches.
  const goBack = () => {
    if (form.formState.isDirty || strengthDirty) {
      form.handleSubmit((v) => save(v, editing.day - 1))();
    } else {
      onAdvance(editing.day - 1);
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden"
        onSubmit={form.handleSubmit((v) => save(v, editing.serial && !isLast ? editing.day + 1 : "close"))}
        noValidate
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{WEEKDAY_FULL_PL[editing.day]}</DialogTitle>
          <DialogDescription>
            {editing.serial ? `Uzupełniasz tydzień · dzień ${editing.day + 1} z 7` : "Edytuj dzień planu"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          {editing.serial && (
            <div className="flex items-center gap-2">
              {editing.day > 0 && (
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-0.5 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground"
                  disabled={isSubmitting}
                  onClick={goBack}
                >
                  <ChevronLeft className="size-3.5" />
                  {WEEKDAY_FULL_PL[editing.day - 1]}
                </button>
              )}
              <div className="flex flex-1 gap-1">
                {WEEKDAY_FULL_PL.map((name, i) => (
                  <span
                    key={name}
                    className={`h-1 flex-1 rounded-full ${i <= editing.day ? "bg-ember" : "bg-muted"}`}
                  />
                ))}
              </div>
            </div>
          )}

          <FormField
            control={form.control}
            name="intensity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Intensywność</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PLAN_INTENSITIES.map((intensity) => (
                      <button
                        key={intensity}
                        type="button"
                        className={`rounded-md border px-2 py-1.5 font-semibold text-xs transition-colors ${
                          field.value === intensity
                            ? "border-transparent bg-ember"
                            : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                        onClick={() => field.onChange(intensity)}
                      >
                        {PLAN_INTENSITY_LABEL[intensity]}
                      </button>
                    ))}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="training"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trening</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    autoFocus
                    placeholder={"Rano: interwały bieżnia 6×3′\nWieczór: rehab stopa + kostka"}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="goal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cel (opcjonalnie)</FormLabel>
                <FormControl>
                  <Textarea rows={2} placeholder="np. przysiad 4×5 @ 112.5" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Strength session: additive to the free-text training above.
              The ordered list seeds a new session started on this weekday. */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-sm">Sesja siłowa tego dnia?</span>
              <button
                type="button"
                role="switch"
                aria-checked={hasStrength}
                aria-label="Sesja siłowa tego dnia"
                onClick={() => setHasStrength((v) => !v)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${hasStrength ? "bg-ember" : "bg-muted"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${hasStrength ? "translate-x-4" : "translate-x-0"}`}
                />
              </button>
            </div>

            {hasStrength && (
              <div className="space-y-2">
                {picked.length > 0 ? (
                  <ul className="space-y-1">
                    {picked.map((ex, i) => (
                      <li
                        key={ex.exerciseId}
                        className="flex items-center gap-1 rounded-md border bg-card px-2.5 py-1.5 text-sm"
                      >
                        <span className="w-4 shrink-0 text-muted-foreground text-xs tabular-nums">{i + 1}.</span>
                        <span className="min-w-0 flex-1 truncate">{ex.namePl}</span>
                        <button
                          type="button"
                          aria-label="W górę"
                          disabled={i === 0}
                          onClick={() => moveExercise(i, -1)}
                          className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="W dół"
                          disabled={i === picked.length - 1}
                          onClick={() => moveExercise(i, 1)}
                          className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Usuń ${ex.namePl}`}
                          onClick={() => removeExercise(ex.exerciseId)}
                          className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Dodaj ćwiczenia w kolejności, w jakiej pojawią się w sesji.
                  </p>
                )}

                <Input placeholder="Szukaj ćwiczenia…" value={query} onChange={(e) => setQuery(e.target.value)} />
                {q.length > 0 && (
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1">
                    {matches.length === 0 ? (
                      <li className="px-2 py-1.5 text-muted-foreground text-xs">Brak wyników.</li>
                    ) : (
                      matches.map((ex) => (
                        <li key={ex.id}>
                          <button
                            type="button"
                            className="w-full rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                            onClick={() => addExercise(ex)}
                          >
                            {ex.namePl}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>

          <FormRootMessage />
        </div>

        <div className="shrink-0 space-y-2 p-4 pt-2">
          <Button type="submit" className="w-full bg-ember shadow-ember" size="lg" disabled={isSubmitting}>
            {isSubmitting ? (
              <Spinner size="sm" />
            ) : editing.serial && !isLast ? (
              `Zapisz i dalej → ${WEEKDAY_FULL_PL[editing.day + 1]}`
            ) : editing.serial ? (
              "Zapisz i zakończ"
            ) : (
              "Zapisz"
            )}
          </Button>
          {editing.serial && !isLast && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isSubmitting}
              onClick={form.handleSubmit((v) => save(v, "close"))}
            >
              Zapisz i zamknij
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
