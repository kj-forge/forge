import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UNIT_INTENSITIES, UNIT_INTENSITY_LABEL } from "@/features/plan/constants";
import {
  type HyroxBlockDraft,
  hyroxDraftsFromUnitSteps,
  hyroxStepsPayload,
  validateHyroxBlocks,
} from "@/features/plan/lib/hyrox-blocks";
import { type UnitFormValues, unitFormSchema, unitTrainingRequired } from "@/features/plan/lib/unit-form";
import { deleteUnit, upsertUnit } from "@/features/plan/server/plan";
import type { PlanUnit } from "@/features/plan/types";
import { PICKABLE_SESSION_TYPES, SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";
import type { ExerciseOption } from "./ExerciseListPicker";
import { HyroxBlocksEditor } from "./HyroxBlocksEditor";
import { draftsFromUnitSteps, type UnitStepDraft, UnitStepsEditor } from "./UnitStepsEditor";

export type UnitEditing = {
  planId: string;
  planName: string;
  // null = new unit in that plan.
  unit: Pick<PlanUnit, "id" | "name" | "sessionType" | "intensity" | "training" | "goal" | "steps"> | null;
};

interface UnitDrawerProps {
  editing: UnitEditing | null;
  allExercises: ExerciseOption[];
  onClose: () => void;
}

export function UnitDrawer({ editing, allExercises, onClose }: UnitDrawerProps) {
  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {editing ? (
          <UnitDrawerBody
            key={editing.unit?.id ?? "new"}
            editing={editing}
            allExercises={allExercises}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function UnitDrawerBody({
  editing,
  allExercises,
  onClose,
}: {
  editing: UnitEditing;
  allExercises: ExerciseOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const unit = editing.unit;
  const form = useForm<UnitFormValues>({
    resolver: zodResolver(unitFormSchema),
    defaultValues: {
      name: unit?.name ?? "",
      sessionType: (unit?.sessionType as UnitFormValues["sessionType"]) ?? "STRENGTH",
      intensity: unit?.intensity ?? "MEDIUM",
      training: unit?.training ?? "",
      goal: unit?.goal ?? "",
    },
    mode: "onSubmit",
  });
  const sessionType = useWatch({ control: form.control, name: "sessionType" });

  // The ordered step structure lives outside RHF (nested ordered lists are
  // awkward as field arrays); merged into the payload at save.
  const [steps, setSteps] = useState<UnitStepDraft[]>(() => draftsFromUnitSteps(unit?.steps));
  const [hyroxBlocks, setHyroxBlocks] = useState<HyroxBlockDraft[]>(() =>
    unit?.sessionType === "HYROX" ? hyroxDraftsFromUnitSteps(unit?.steps) : [],
  );
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const totalExercises =
    sessionType === "HYROX"
      ? hyroxBlocks.reduce((n, b) => n + b.stations.length, 0)
      : steps.reduce((n, s) => n + s.exercises.length, 0);

  const onSubmit = form.handleSubmit(async (values) => {
    // Cross-field rules the schema can't see (steps are local state): a unit
    // without strength content needs written training, and a workout step
    // can't be empty.
    if (unitTrainingRequired(values.sessionType, totalExercises) && values.training.trim().length === 0) {
      form.setError("training", { type: "manual", message: "Wpisz opis albo dodaj ćwiczenia siłowe." });
      return;
    }
    if (
      values.sessionType === "STRENGTH" &&
      steps.some((s) => s.kind === "STRAIGHT_SETS" && s.exercises.length === 0)
    ) {
      form.setError("root.serverError", {
        type: "manual",
        message: "Obwód musi mieć przynajmniej jedno ćwiczenie (albo usuń pusty obwód).",
      });
      return;
    }
    if (values.sessionType === "HYROX") {
      const hyroxError = validateHyroxBlocks(hyroxBlocks);
      if (hyroxError && totalExercises > 0) {
        form.setError("root.serverError", { type: "manual", message: hyroxError });
        return;
      }
    }
    try {
      await upsertUnit({
        data: {
          planId: editing.planId,
          unitId: unit?.id,
          name: values.name,
          sessionType: values.sessionType,
          intensity: values.intensity,
          training: values.training,
          goal: values.goal || undefined,
          steps:
            values.sessionType === "HYROX"
              ? totalExercises > 0
                ? hyroxStepsPayload(hyroxBlocks)
                : []
              : steps.map((s) =>
                  s.kind === "REST"
                    ? {
                        kind: "REST" as const,
                        durationSeconds: s.durationMinutes ? Math.round(Number(s.durationMinutes) * 60) : undefined,
                        note: s.note.trim() || undefined,
                        exercises: [],
                      }
                    : {
                        kind: "STRAIGHT_SETS" as const,
                        targetRounds: s.exercises.length > 1 && s.targetRounds ? Number(s.targetRounds) : undefined,
                        exercises: s.exercises.map((e) => ({ exerciseId: e.exerciseId })),
                      },
                ),
        },
      });
      await router.invalidate();
      onClose();
    } catch (err) {
      form.setError("root.serverError", {
        type: "server",
        message: getErrorMessage(err, "Nie udało się zapisać jednostki."),
      });
    }
  });

  const handleDelete = async () => {
    if (!unit) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteUnit({ data: { unitId: unit.id } });
      await router.invalidate();
      onClose();
    } catch (err) {
      setDeleting(false);
      form.setError("root.serverError", {
        type: "server",
        message: getErrorMessage(err, "Nie udało się usunąć jednostki."),
      });
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden" onSubmit={onSubmit} noValidate>
        <DialogHeader className="shrink-0">
          <DialogTitle>{unit ? "Edytuj trening" : "Nowy trening"}</DialogTitle>
          <DialogDescription>Plan „{editing.planName}”</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nazwa</FormLabel>
                <FormControl>
                  <Input autoFocus={!unit} placeholder="np. Trening A — góra" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
            name="intensity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Intensywność</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-3 gap-1.5">
                    {UNIT_INTENSITIES.map((intensity) => (
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
                        {UNIT_INTENSITY_LABEL[intensity]}
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
                <FormLabel>Opis</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder={
                      sessionType === "STRENGTH"
                        ? "np. Przysiad + OHP + drążek + RDL + akcesoria"
                        : "np. Interwały bieżnia 6×3′"
                    }
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

          {/* Step structure seeds the session started from this unit:
              1 exercise = classic step, 2+ = circuit, plus REST breaks. */}
          {sessionType === "STRENGTH" && (
            <div className="space-y-2">
              {/* leading-none matches FormLabel so the gap below reads the
                  same as the RHF fields above. */}
              <span className="font-medium text-sm leading-none">Ćwiczenia i obwody</span>
              <UnitStepsEditor
                steps={steps}
                onChange={setSteps}
                allExercises={allExercises}
                onError={(message) => form.setError("root.serverError", { type: "server", message })}
              />
            </div>
          )}

          {sessionType === "HYROX" && (
            <div className="space-y-2">
              <span className="font-medium text-sm leading-none">Bloki i stacje</span>
              <HyroxBlocksEditor
                blocks={hyroxBlocks}
                onChange={setHyroxBlocks}
                allExercises={allExercises}
                onError={(message) => form.setError("root.serverError", { type: "server", message })}
              />
            </div>
          )}

          <FormRootMessage />
        </div>

        <div className="shrink-0 space-y-2 p-4 pt-2">
          <Button type="submit" className="w-full bg-ember shadow-ember" size="lg" disabled={isSubmitting || deleting}>
            {isSubmitting ? <Spinner size="sm" /> : "Zapisz trening"}
          </Button>
          {unit && (
            <Button
              type="button"
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              disabled={isSubmitting || deleting}
              onClick={handleDelete}
            >
              {deleting ? <Spinner size="sm" /> : confirmDelete ? "Na pewno usunąć?" : "Usuń trening"}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
