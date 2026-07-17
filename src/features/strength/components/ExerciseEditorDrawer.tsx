import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABEL,
  EXERCISE_UNIT_LABEL,
  EXERCISE_UNITS,
} from "@/features/strength/constants";
import { type ExerciseFormValues, exerciseFormSchema, parseAliases } from "@/features/strength/lib/exercise-form";
import { createExercise, deleteExercise, updateExercise } from "@/features/strength/server/exercises";
import type { ManagedExercise } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

interface ExerciseEditorDrawerProps {
  open: boolean;
  // Null = create a new custom exercise.
  exercise: ManagedExercise | null;
  onClose: () => void;
}

export function ExerciseEditorDrawer({ open, exercise, onClose }: ExerciseEditorDrawerProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        {open ? <ExerciseEditorBody key={exercise?.id ?? "new"} exercise={exercise} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SwitchRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-ember" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function ExerciseEditorBody({ exercise, onClose }: { exercise: ManagedExercise | null; onClose: () => void }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const form = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: {
      namePl: exercise?.namePl ?? "",
      category: exercise?.category ?? "ACCESSORY",
      defaultUnit: exercise?.defaultUnit ?? "REPS",
      isMainLift: exercise?.isMainLift ?? false,
      isPrTracked: exercise?.isPrTracked ?? true,
      isLoadedBodyweight: exercise?.isLoadedBodyweight ?? false,
      aliasesText: exercise?.aliases.join(", ") ?? "",
    },
    mode: "onSubmit",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      namePl: values.namePl,
      category: values.category,
      defaultUnit: values.defaultUnit,
      isMainLift: values.isMainLift,
      isPrTracked: values.isPrTracked,
      isLoadedBodyweight: values.isLoadedBodyweight,
      aliases: parseAliases(values.aliasesText),
    };
    try {
      if (exercise) {
        await updateExercise({ data: { id: exercise.id, ...payload } });
      } else {
        await createExercise({ data: payload });
      }
      await router.invalidate();
      onClose();
    } catch (err) {
      form.setError("root.serverError", {
        type: "server",
        message: getErrorMessage(err, "Nie udało się zapisać ćwiczenia."),
      });
    }
  });

  const handleDelete = async () => {
    if (!exercise) return;
    setDeleting(true);
    try {
      await deleteExercise({ data: { exerciseId: exercise.id } });
      await router.invalidate();
      onClose();
    } catch (err) {
      setDeleting(false);
      form.setError("root.serverError", {
        type: "server",
        message: getErrorMessage(err, "Nie udało się usunąć ćwiczenia."),
      });
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden" onSubmit={onSubmit} noValidate>
        <DialogHeader className="shrink-0">
          <DialogTitle>{exercise ? "Edytuj ćwiczenie" : "Nowe ćwiczenie"}</DialogTitle>
          <DialogDescription>
            {exercise ? "Zmiany dotyczą tylko Twojego katalogu." : "Trafi tylko do Twojego katalogu."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          <FormField
            control={form.control}
            name="namePl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nazwa</FormLabel>
                <FormControl>
                  <Input placeholder="np. Belt squat" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Kategoria</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-2 gap-1.5">
                    {EXERCISE_CATEGORIES.map((category) => (
                      <button
                        key={category}
                        type="button"
                        className={`rounded-md border px-2 py-1.5 font-semibold text-xs transition-colors ${
                          field.value === category
                            ? "border-transparent bg-ember"
                            : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                        onClick={() => field.onChange(category)}
                      >
                        {EXERCISE_CATEGORY_LABEL[category]}
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
            name="defaultUnit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Jednostka</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-2 gap-1.5">
                    {EXERCISE_UNITS.map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        className={`rounded-md border px-2 py-1.5 font-semibold text-xs transition-colors ${
                          field.value === unit
                            ? "border-transparent bg-ember"
                            : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                        onClick={() => field.onChange(unit)}
                      >
                        {EXERCISE_UNIT_LABEL[unit]}
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
            name="isMainLift"
            render={({ field }) => (
              <SwitchRow
                label="Bój główny (tabela PR, trend)"
                checked={field.value}
                onToggle={() => field.onChange(!field.value)}
              />
            )}
          />

          {/* Main lifts sit in the PR table unconditionally — the opt-out
              only concerns the "Pozostałe" list. */}
          {!form.watch("isMainLift") && (
            <FormField
              control={form.control}
              name="isPrTracked"
              render={({ field }) => (
                <SwitchRow
                  label="Licz do rekordów (sekcja Pozostałe)"
                  checked={field.value}
                  onToggle={() => field.onChange(!field.value)}
                />
              )}
            />
          )}

          <FormField
            control={form.control}
            name="isLoadedBodyweight"
            render={({ field }) => (
              <SwitchRow
                label="Obciążenie dodatkowe (+kg, np. drążek)"
                checked={field.value}
                onToggle={() => field.onChange(!field.value)}
              />
            )}
          />

          <FormField
            control={form.control}
            name="aliasesText"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Aliasy do wyszukiwania (opcjonalnie)</FormLabel>
                <FormControl>
                  <Input placeholder="np. siady, przysiady, BS — po przecinku" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormRootMessage />
        </div>

        <div className="shrink-0 space-y-2 p-4 pt-2">
          <Button type="submit" className="w-full bg-ember shadow-ember" size="lg" disabled={isSubmitting || deleting}>
            {isSubmitting ? <Spinner size="sm" /> : "Zapisz"}
          </Button>
          {exercise && !exercise.isArchived && (
            <Button
              type="button"
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              disabled={isSubmitting || deleting}
              onClick={handleDelete}
            >
              {deleting ? <Spinner size="sm" /> : exercise.inUse ? "Archiwizuj (ma historię)" : "Usuń ćwiczenie"}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
