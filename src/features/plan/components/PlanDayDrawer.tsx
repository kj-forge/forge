import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { PLAN_INTENSITIES, PLAN_INTENSITY_LABEL } from "@/features/plan/constants";
import { type PlanDayFormValues, planDayFormSchema } from "@/features/plan/lib/plan-day-form";
import { upsertPlanDay } from "@/features/plan/server/plan";
import type { PlanDay } from "@/features/plan/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";
import { WEEKDAY_FULL_PL } from "@/shared/lib/weekday";

export type PlanEditing = { day: number; serial: boolean };

interface PlanDayDrawerProps {
  editing: PlanEditing | null;
  byDay: Map<number, PlanDay>;
  onClose: () => void;
  onAdvance: (nextDay: number) => void;
}

export function PlanDayDrawer({ editing, byDay, onClose, onAdvance }: PlanDayDrawerProps) {
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
  onClose,
  onAdvance,
}: {
  editing: PlanEditing;
  entry: PlanDay | undefined;
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

  const isLast = editing.day === 6;

  const save = async (values: PlanDayFormValues, goTo: number | "close") => {
    try {
      await upsertPlanDay({
        data: {
          dayOfWeek: editing.day,
          intensity: values.intensity,
          training: values.training,
          goal: values.goal || undefined,
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

  // Backing up mid-wizard must never lose typing: a dirty form saves first
  // (invalid input surfaces its message instead), a clean one just switches.
  const goBack = () => {
    if (form.formState.isDirty) {
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
