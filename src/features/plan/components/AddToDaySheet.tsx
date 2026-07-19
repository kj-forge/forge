import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type AdhocFormValues, adhocFormSchema } from "@/features/plan/lib/adhoc-form";
import { addScheduleEntry } from "@/features/plan/server/plan";
import type { PlanWithUnits } from "@/features/plan/types";
import { PICKABLE_SESSION_TYPES, SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import { getErrorMessage } from "@/lib/error-message";
import { SearchInput } from "@/shared/components/SearchInput";
import { Spinner } from "@/shared/components/Spinner";
import { WEEKDAY_FULL_PL } from "@/shared/lib/weekday";

const DAY_FMT = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long" });

interface AddToDaySheetProps {
  // ISO date of the tapped day; null = closed.
  date: string | null;
  dayOfWeek: number;
  plans: PlanWithUnits[];
  onClose: () => void;
}

// "+ dodaj trening w ten dzień": either a one-off placement of any plan unit
// (ADD override) or a quick ad-hoc entry (ADHOC). Neither touches the weekly
// pattern.
export function AddToDaySheet({ date, dayOfWeek, plans, onClose }: AddToDaySheetProps) {
  return (
    <Dialog
      open={date !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {date ? <AddToDayBody key={date} date={date} dayOfWeek={dayOfWeek} plans={plans} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddToDayBody({
  date,
  dayOfWeek,
  plans,
  onClose,
}: {
  date: string;
  dayOfWeek: number;
  plans: PlanWithUnits[];
  onClose: () => void;
}) {
  const router = useRouter();
  // No plan units to pick from → straight to the quick ad-hoc form.
  const [mode, setMode] = useState<"pick" | "adhoc">(() => (plans.some((p) => p.units.length > 0) ? "pick" : "adhoc"));
  const [addingUnitId, setAddingUnitId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // All plans/units are already client-side (one getPlanScreen payload), so
  // scaling here is a filter, not pagination: search + per-plan grouping.
  const q = query.trim().toLowerCase();
  const totalUnits = plans.reduce((n, p) => n + p.units.length, 0);
  const groups = plans
    .map((plan) => ({
      plan,
      units: q
        ? plan.units.filter(
            (u) =>
              plan.name.toLowerCase().includes(q) ||
              u.name.toLowerCase().includes(q) ||
              SESSION_TYPE_LABEL_PL[u.sessionType].toLowerCase().includes(q),
          )
        : plan.units,
    }))
    .filter((g) => g.units.length > 0);

  const addUnit = async (unitId: string) => {
    setAddingUnitId(unitId);
    setPickError(null);
    try {
      await addScheduleEntry({ data: { date, unitId } });
      await router.invalidate();
      onClose();
    } catch (err) {
      setAddingUnitId(null);
      setPickError(getErrorMessage(err, "Nie udało się dodać treningu."));
    }
  };

  const form = useForm<AdhocFormValues>({
    resolver: zodResolver(adhocFormSchema),
    defaultValues: { sessionType: "OTHER", name: "", note: "" },
    mode: "onSubmit",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await addScheduleEntry({
        data: { date, sessionType: values.sessionType, name: values.name, note: values.note || undefined },
      });
      await router.invalidate();
      onClose();
    } catch (err) {
      form.setError("root.serverError", {
        type: "server",
        message: getErrorMessage(err, "Nie udało się dodać treningu."),
      });
    }
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
      <DialogHeader className="shrink-0">
        <DialogTitle>
          {WEEKDAY_FULL_PL[dayOfWeek]} · {DAY_FMT.format(new Date(`${date}T00:00:00`))}
        </DialogTitle>
        <DialogDescription>Dodaj trening tylko w ten dzień — plan tygodnia zostaje bez zmian.</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
        {mode === "pick" ? (
          <>
            {totalUnits > 5 && (
              <SearchInput
                placeholder="Szukaj: plan, trening lub typ…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            {totalUnits === 0 ? (
              <p className="text-muted-foreground text-sm">Nie masz jeszcze treningów w planach.</p>
            ) : groups.length === 0 ? (
              <p className="text-muted-foreground text-sm">Brak treningów pasujących do „{query.trim()}”.</p>
            ) : (
              groups.map(({ plan, units }) => (
                <div key={plan.id}>
                  <p className="mb-1 font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
                    {plan.name}
                  </p>
                  <ul className="space-y-1">
                    {units.map((unit) => (
                      <li key={unit.id}>
                        <button
                          type="button"
                          disabled={addingUnitId !== null}
                          className="flex w-full items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                          onClick={() => addUnit(unit.id)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{unit.name}</span>
                            <span className="block truncate text-muted-foreground text-xs">
                              {SESSION_TYPE_LABEL_PL[unit.sessionType]}
                            </span>
                          </span>
                          {addingUnitId === unit.id && <Spinner size="sm" className="shrink-0 text-muted-foreground" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
            {pickError && <p className="font-medium text-destructive text-sm">{pickError}</p>}
            <Button type="button" variant="outline" className="w-full" onClick={() => setMode("adhoc")}>
              + Szybki trening (poza planem)
            </Button>
          </>
        ) : (
          <Form {...form}>
            <form className="space-y-4" onSubmit={onSubmit} noValidate>
              <FormField
                control={form.control}
                name="sessionType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Typ</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-4 gap-1.5">
                        {PICKABLE_SESSION_TYPES.map((type) => (
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
                            {SESSION_TYPE_LABEL_PL[type]}
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nazwa</FormLabel>
                    <FormControl>
                      <Input autoFocus placeholder="np. Pływanie 45′" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notatka (opcjonalnie)</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="np. luźno, technika" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormRootMessage />
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setMode("pick")}>
                  Wróć
                </Button>
                <Button type="submit" className="flex-1 bg-ember shadow-ember" disabled={isSubmitting}>
                  {isSubmitting ? <Spinner size="sm" /> : "Dodaj"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
