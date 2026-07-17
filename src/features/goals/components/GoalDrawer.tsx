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
import { GOAL_PLACEHOLDERS, GOAL_TYPE_LABEL, GOAL_TYPES } from "@/features/goals/constants";
import { type GoalFormValues, goalFormSchema } from "@/features/goals/lib/goal-form";
import { deleteGoal, upsertGoal } from "@/features/goals/server/goals";
import type { GoalRow } from "@/features/goals/types";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

export type ExerciseOption = { id: string; namePl: string; aliases: string[] };

const TARGET_DATE_FMT = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric" });

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
  const [dateOpen, setDateOpen] = useState(false);
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

  // Strength goals pick the exercise through the same search surface as the
  // session/plan pickers (name OR alias) — no separate title to type.
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q
    ? exercises
        .filter((e) => e.namePl.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)))
        .slice(0, 8)
    : [];

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await upsertGoal({
        data: {
          id: goal?.id,
          type: values.type,
          // Strength: server derives title (exercise name) and unit (kg).
          title: values.type === "STRENGTH_RM" ? undefined : values.title,
          targetValue: values.targetValue ? Number(values.targetValue) : undefined,
          targetReps: values.targetReps ? Number(values.targetReps) : undefined,
          targetUnit: values.type === "STRENGTH_RM" ? undefined : values.targetUnit || undefined,
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

          {currentType !== "STRENGTH_RM" && (
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{hints.titleLabel}</FormLabel>
                  <FormControl>
                    <Input placeholder={hints.title} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {currentType === "STRENGTH_RM" && (
            <FormField
              control={form.control}
              name="exerciseId"
              render={({ field }) => {
                const selected = exercises.find((e) => e.id === field.value);
                return (
                  <FormItem>
                    <FormLabel>Ćwiczenie (postęp z realnych serii)</FormLabel>
                    <FormControl>
                      {selected ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm">
                          <span className="truncate font-medium">{selected.namePl}</span>
                          <button
                            type="button"
                            className="shrink-0 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground"
                            onClick={() => field.onChange("")}
                          >
                            Zmień
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <Input
                            type="search"
                            placeholder="Szukaj ćwiczenia…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            maxLength={50}
                          />
                          {q.length > 0 && (
                            <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1">
                              {matches.length === 0 ? (
                                <li className="px-2 py-1.5 text-muted-foreground text-xs">Brak wyników.</li>
                              ) : (
                                matches.map((e) => (
                                  <li key={e.id}>
                                    <button
                                      type="button"
                                      className="w-full rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                                      onClick={() => {
                                        field.onChange(e.id);
                                        setQuery("");
                                      }}
                                    >
                                      {e.namePl}
                                    </button>
                                  </li>
                                ))
                              )}
                            </ul>
                          )}
                        </div>
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          )}

          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <FormField
              control={form.control}
              name="targetValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{currentType === "STRENGTH_RM" ? "Ciężar (kg)" : "Wartość celu"}</FormLabel>
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
            {/* "160kg @3RM" — the goal is weight AT a rep count; progress
                only counts real sets with at least this many reps. The unit
                is implied (kg), so no unit field for strength goals. */}
            {currentType === "STRENGTH_RM" ? (
              <FormField
                control={form.control}
                name="targetReps"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Powt. (RM)</FormLabel>
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
            ) : (
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
            )}
          </div>

          {/* shadcn date picker, not a native <input type=date>: iOS writes
              today's date the moment the field is tapped and its Reset button
              doesn't fire change events — here the value only changes on an
              explicit day click, and the X clears it. */}
          <FormField
            control={form.control}
            name="targetDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Termin (opcjonalnie)</FormLabel>
                <div className="flex items-center gap-2">
                  <Popover modal open={dateOpen} onOpenChange={setDateOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          className={`min-w-0 flex-1 justify-start font-normal ${field.value ? "" : "text-muted-foreground"}`}
                        >
                          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {field.value ? TARGET_DATE_FMT.format(new Date(`${field.value}T00:00:00`)) : "Wybierz datę"}
                          </span>
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        locale={pl}
                        selected={field.value ? new Date(`${field.value}T00:00:00`) : undefined}
                        onSelect={(d) => {
                          field.onChange(d ? dayjs(d).format("YYYY-MM-DD") : "");
                          setDateOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  {field.value && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      aria-label="Usuń termin"
                      onClick={() => field.onChange("")}
                    >
                      <X />
                    </Button>
                  )}
                </div>
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
