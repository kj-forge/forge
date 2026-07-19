import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import dayjs from "dayjs";
import { CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import { pl } from "react-day-picker/locale";
import { useForm, useWatch } from "react-hook-form";
import { NumericFormat } from "react-number-format";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type ActivateFormValues, activateFormSchema, activationEndDate } from "@/features/plan/lib/activate-form";
import { warsawTodayIso } from "@/features/plan/lib/schedule";
import { activatePlan } from "@/features/plan/server/plan";
import type { PlanWithUnits } from "@/features/plan/types";
import { SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";
import { WEEKDAY_LABELS_PL } from "@/shared/lib/weekday";

const START_DATE_FMT = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric" });

interface ActivatePlanDialogProps {
  plan: PlanWithUnits | null;
  onClose: () => void;
}

export function ActivatePlanDialog({ plan, onClose }: ActivatePlanDialogProps) {
  return (
    <Dialog
      open={plan !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>{plan ? <ActivateBody key={plan.id} plan={plan} onClose={onClose} /> : null}</DialogContent>
    </Dialog>
  );
}

function ActivateBody({ plan, onClose }: { plan: PlanWithUnits; onClose: () => void }) {
  const router = useRouter();
  const [dateOpen, setDateOpen] = useState(false);
  const form = useForm<ActivateFormValues>({
    resolver: zodResolver(activateFormSchema),
    defaultValues: {
      // "Zmień dni" on an ACTIVE plan must not silently shift the window to
      // today (that hides the plan from earlier days of the current week) —
      // keep the running start; fresh/paused activations default to today.
      startDate: (plan.status === "ACTIVE" && plan.startDate) || warsawTodayIso(),
      // Re-activation prefill: deriving a remaining term only makes sense for
      // a fresh run, so weeks always starts empty.
      weeks: undefined,
    },
    mode: "onSubmit",
  });

  // Weekday chips live outside RHF — prefilled from the plan's surviving
  // assignments so re-activation starts where the last run left off.
  const [days, setDays] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(plan.units.map((u) => [u.id, u.days])),
  );
  const [assignError, setAssignError] = useState<string | null>(null);

  const toggleDay = (unitId: string, day: number) => {
    setAssignError(null);
    setDays((prev) => {
      const current = prev[unitId] ?? [];
      return {
        ...prev,
        [unitId]: current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
      };
    });
  };

  const weeks = useWatch({ control: form.control, name: "weeks" });

  const onSubmit = form.handleSubmit(async (values) => {
    const assignments = plan.units.map((u) => ({ unitId: u.id, days: days[u.id] ?? [] }));
    if (!assignments.some((a) => a.days.length > 0)) {
      setAssignError("Przypisz przynajmniej jeden trening do dnia tygodnia.");
      return;
    }
    try {
      await activatePlan({
        data: {
          planId: plan.id,
          startDate: values.startDate,
          endDate: activationEndDate(values.startDate, values.weeks) ?? undefined,
          assignments,
        },
      });
      await router.invalidate();
      onClose();
    } catch (err) {
      form.setError("root.serverError", {
        type: "server",
        message: getErrorMessage(err, "Nie udało się aktywować planu."),
      });
    }
  });

  const isSubmitting = form.formState.isSubmitting;
  const endPreview = activationEndDate(form.getValues("startDate"), weeks);

  return (
    <Form {...form}>
      <form className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden" onSubmit={onSubmit} noValidate>
        <DialogHeader className="shrink-0">
          <DialogTitle>Aktywuj „{plan.name}”</DialogTitle>
          <DialogDescription>Wybierz start i dni tygodnia dla treningów.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            {/* shadcn date picker, not a native <input type=date> — same iOS
                reasoning as GoalDrawer. */}
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start</FormLabel>
                  <Popover modal open={dateOpen} onOpenChange={setDateOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button type="button" variant="outline" className="min-w-0 flex-1 justify-start font-normal">
                          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{START_DATE_FMT.format(new Date(`${field.value}T00:00:00`))}</span>
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        locale={pl}
                        selected={new Date(`${field.value}T00:00:00`)}
                        onSelect={(d) => {
                          if (d) field.onChange(dayjs(d).format("YYYY-MM-DD"));
                          setDateOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="weeks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tygodnie</FormLabel>
                  <div className="flex items-center gap-1">
                    <FormControl>
                      <NumericFormat
                        customInput={Input}
                        inputMode="numeric"
                        allowNegative={false}
                        decimalScale={0}
                        placeholder="∞"
                        value={field.value ?? ""}
                        onValueChange={(v) => field.onChange(v.floatValue)}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    {field.value != null && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        aria-label="Bezterminowo"
                        onClick={() => field.onChange(undefined)}
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {endPreview && (
            <p className="text-muted-foreground text-xs">
              Plan wygaśnie {START_DATE_FMT.format(new Date(`${endPreview}T00:00:00`))}.
            </p>
          )}

          <div className="space-y-3">
            {plan.units.map((unit) => (
              <div key={unit.id} className="space-y-1.5 rounded-lg border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-medium text-sm">{unit.name}</span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {SESSION_TYPE_LABEL_PL[unit.sessionType]}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAY_LABELS_PL.map((label, day) => {
                    const active = (days[unit.id] ?? []).includes(day);
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={active}
                        className={`rounded-md border px-0.5 py-1.5 font-semibold text-[10px] transition-colors ${
                          active ? "border-transparent bg-ember" : "border-border text-muted-foreground hover:bg-accent"
                        }`}
                        onClick={() => toggleDay(unit.id, day)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {assignError && <p className="font-medium text-destructive text-sm">{assignError}</p>}

          <FormRootMessage />
        </div>

        <div className="shrink-0 p-4 pt-2">
          <Button type="submit" className="w-full bg-ember shadow-ember" size="lg" disabled={isSubmitting}>
            {isSubmitting ? <Spinner size="sm" /> : "Aktywuj plan"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
