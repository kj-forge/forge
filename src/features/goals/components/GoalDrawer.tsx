import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { NumericFormat } from "react-number-format";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { GOAL_PLACEHOLDERS, GOAL_TYPE_LABEL, GOAL_TYPES } from "@/features/goals/constants";
import { type GoalFormValues, goalFormSchema } from "@/features/goals/lib/goal-form";
import { deleteGoal, upsertGoal } from "@/features/goals/server/goals";
import type { GoalRow } from "@/features/goals/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

export type ExerciseOption = { id: string; namePl: string };

interface GoalDrawerProps {
  open: boolean;
  goal: GoalRow | null;
  exercises: ExerciseOption[];
  onClose: () => void;
}

export function GoalDrawer({ open, goal, exercises, onClose }: GoalDrawerProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        {open ? <GoalDrawerBody goal={goal} exercises={exercises} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function GoalDrawerBody({
  goal,
  exercises,
  onClose,
}: {
  goal: GoalRow | null;
  exercises: ExerciseOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const form = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: {
      type: goal?.type ?? "STRENGTH_RM",
      title: goal?.title ?? "",
      targetValue: goal?.targetValue != null ? String(goal.targetValue) : "",
      targetReps: goal?.targetReps != null ? String(goal.targetReps) : "1",
      targetUnit: goal?.targetUnit ?? "",
      targetDate: goal?.targetDate ?? "",
      exerciseId: goal?.exerciseId ?? "",
    },
    mode: "onSubmit",
  });

  const currentType = useWatch({ control: form.control, name: "type" });
  const hints = GOAL_PLACEHOLDERS[currentType];

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await upsertGoal({
        data: {
          id: goal?.id,
          type: values.type,
          title: values.title,
          targetValue: values.targetValue ? Number(values.targetValue) : undefined,
          targetReps: values.targetReps ? Number(values.targetReps) : undefined,
          targetUnit: values.targetUnit || undefined,
          targetDate: values.targetDate || undefined,
          exerciseId: values.exerciseId || undefined,
        },
      });
      await router.invalidate();
      onClose();
    } catch (err) {
      form.setError("root.serverError", {
        type: "server",
        message: getErrorMessage(err, "Nie udało się zapisać celu."),
      });
    }
  });

  const handleDelete = async () => {
    if (!goal) return;
    setDeleting(true);
    try {
      await deleteGoal({ data: { goalId: goal.id } });
      await router.invalidate();
      onClose();
    } catch (err) {
      setDeleting(false);
      form.setError("root.serverError", {
        type: "server",
        message: getErrorMessage(err, "Nie udało się usunąć celu."),
      });
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden" onSubmit={onSubmit} noValidate>
        <DialogHeader className="shrink-0">
          <DialogTitle>{goal ? "Edytuj cel" : "Nowy cel"}</DialogTitle>
          <DialogDescription>
            {goal ? "Zmień parametry albo usuń cel." : "Siła, czas wyścigu, sylwetka — wyznacz kierunek."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Typ</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-2 gap-1.5">
                    {GOAL_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`rounded-md border px-2 py-1.5 font-semibold text-xs transition-colors ${
                          field.value === type
                            ? "border-transparent bg-ember"
                            : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                        onClick={() => field.onChange(type)}
                      >
                        {GOAL_TYPE_LABEL[type]}
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
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tytuł</FormLabel>
                <FormControl>
                  <Input placeholder={hints.title} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {currentType === "STRENGTH_RM" && (
            <FormField
              control={form.control}
              name="exerciseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bój (postęp z realnych serii)</FormLabel>
                  <FormControl>
                    <select
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                      {...field}
                    >
                      <option value="">— wybierz ćwiczenie —</option>
                      {exercises.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.namePl}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div
            className={`grid gap-2 ${currentType === "STRENGTH_RM" ? "grid-cols-[2fr_1fr_1fr]" : "grid-cols-[2fr_1fr]"}`}
          >
            <FormField
              control={form.control}
              name="targetValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Wartość celu</FormLabel>
                  <FormControl>
                    <NumericFormat
                      customInput={Input}
                      inputMode="decimal"
                      allowNegative={false}
                      decimalScale={2}
                      placeholder={hints.value}
                      value={field.value}
                      onValueChange={(v) => field.onChange(v.value)}
                      onBlur={field.onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* "160 kg × 3" — the goal is weight AT a rep count; progress
                only counts real sets with at least this many reps. */}
            {currentType === "STRENGTH_RM" && (
              <FormField
                control={form.control}
                name="targetReps"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Powt.</FormLabel>
                    <FormControl>
                      <NumericFormat
                        customInput={Input}
                        inputMode="numeric"
                        allowNegative={false}
                        decimalScale={0}
                        placeholder="1"
                        value={field.value}
                        onValueChange={(v) => field.onChange(v.value)}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="targetUnit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jedn.</FormLabel>
                  <FormControl>
                    <Input placeholder={hints.unit} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="targetDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Termin (opcjonalnie)</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormRootMessage />
        </div>

        <div className="shrink-0 space-y-2 p-4 pt-2">
          <Button type="submit" className="w-full bg-ember shadow-ember" size="lg" disabled={isSubmitting || deleting}>
            {isSubmitting ? <Spinner size="sm" /> : "Zapisz cel"}
          </Button>
          {goal && (
            <Button
              type="button"
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              disabled={isSubmitting || deleting}
              onClick={handleDelete}
            >
              {deleting ? <Spinner size="sm" /> : "Usuń cel"}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
