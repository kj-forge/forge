import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { NumericFormat } from "react-number-format";
import { z } from "zod";

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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SET_KIND_COLOR, SET_KIND_LABEL, SET_KINDS, VISIBLE_SET_KINDS } from "@/features/strength/constants";
import { formatSet } from "@/features/strength/lib/format-set";
import { suggestKind } from "@/features/strength/lib/suggest-kind";
import type { KindRef, RefKind } from "@/features/strength/server/sessions";
import { addSet, deleteSet } from "@/features/strength/server/sets";
import type { Movement, SetKind } from "@/features/strength/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

interface ExerciseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movement: Movement;
}

const setFormSchema = z.object({
  kind: z.enum(SET_KINDS),
  reps: z
    .number({ error: "Wpisz liczbę powtórzeń." })
    .int("Liczba całkowita")
    .min(1, "Min 1 powtórzenie")
    .max(999, "Max 999"),
  weightKg: z.number({ error: "Wpisz ciężar (0 = bodyweight)." }).min(0, "Min 0").max(999, "Max 999 kg"),
  rpe: z.number().int().min(6).max(10).nullable(),
});

type SetFormValues = z.infer<typeof setFormSchema>;

// A historical reference set → form inputs. No history leaves both empty;
// a null weight (bodyweight) becomes 0 ("0 = bodyweight").
function refToFields(ref: KindRef | undefined): { reps: number | undefined; weightKg: number | undefined } {
  if (!ref) return { reps: undefined, weightKg: undefined };
  return { reps: ref.reps ?? undefined, weightKg: ref.weightKg ?? 0 };
}

export function ExerciseDrawer({ open, onOpenChange, movement }: ExerciseDrawerProps) {
  // Conditional-mount the body so the form re-seeds its defaults from the
  // latest sets + lastByKind every time the drawer opens.
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>{open ? <ExerciseDrawerBody movement={movement} /> : null}</DrawerContent>
    </Drawer>
  );
}

function ExerciseDrawerBody({ movement }: { movement: Movement }) {
  const router = useRouter();

  const initialKind = suggestKind(movement);
  const initialFields = refToFields(movement.lastByKind[initialKind as RefKind]);

  const form = useForm<SetFormValues>({
    resolver: zodResolver(setFormSchema),
    defaultValues: {
      kind: initialKind,
      reps: initialFields.reps,
      weightKg: initialFields.weightKg,
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
      await addSet({
        data: {
          blockMovementId: movement.id,
          reps: values.reps,
          weightKg,
          rpe,
          kind: values.kind,
        },
      });
      await router.invalidate();
      // Carry-over for the next set: keep kind/reps/weight, clear RPE only.
      form.reset({
        kind: values.kind,
        reps: values.reps,
        weightKg: values.weightKg,
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

  // Switching kind pre-fills that kind's last-session reference; if there's no
  // history for it, the current inputs stay as the athlete left them.
  const handleKindChange = (k: SetKind) => {
    form.setValue("kind", k);
    const ref = movement.lastByKind[k as RefKind];
    if (!ref) return;
    form.setValue("reps", (ref.reps ?? undefined) as number);
    form.setValue("weightKg", ref.weightKg ?? 0);
  };

  const isSubmitting = form.formState.isSubmitting;
  const currentKind = useWatch({ control: form.control, name: "kind" });

  return (
    <Form {...form}>
      <form className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden" onSubmit={onSubmit} noValidate>
        <DrawerHeader className="shrink-0">
          <DrawerTitle>{movement.exerciseNamePl}</DrawerTitle>
          <DrawerDescription>
            {movement.sets.length === 0
              ? "Pierwsza seria"
              : `${movement.sets.length} ${movement.sets.length === 1 ? "seria" : "serii"} w tej sesji`}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
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
                          className={`rounded-md border px-2 py-1.5 font-medium text-xs transition-colors ${
                            field.value === k
                              ? "border-foreground bg-foreground text-background"
                              : `border-border ${SET_KIND_COLOR[k]} hover:bg-accent`
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
                      onClick={() => field.onChange(Math.max(1, (field.value ?? 1) - 1))}
                    >
                      −
                    </Button>
                    <NumericFormat
                      id="reps"
                      customInput={Input}
                      className="text-center text-lg"
                      value={field.value ?? ""}
                      onValueChange={(values) => field.onChange(values.floatValue)}
                      decimalScale={0}
                      allowNegative={false}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => field.onChange((field.value ?? 0) + 1)}
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
                      onClick={() => field.onChange(Math.max(0, Math.round(((field.value ?? 0) - 2.5) * 10) / 10))}
                    >
                      −2.5
                    </Button>
                    <NumericFormat
                      id="weight"
                      customInput={Input}
                      className="text-center text-lg"
                      value={field.value ?? ""}
                      onValueChange={(values) => field.onChange(values.floatValue)}
                      decimalScale={2}
                      allowNegative={false}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => field.onChange(Math.round(((field.value ?? 0) + 2.5) * 10) / 10)}
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
                        className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                          field.value === v
                            ? "border-foreground bg-foreground text-background"
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

        <DrawerFooter className="shrink-0 gap-2">
          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Zapisuję..." : `⚡ Zapisz serię (${SET_KIND_LABEL[currentKind]})`}
          </Button>
          <DrawerClose asChild>
            <Button type="button" variant="outline" className="w-full">
              Zamknij
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </form>
    </Form>
  );
}
