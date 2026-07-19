import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPlan, updatePlan } from "@/features/plan/server/plan";
import { getErrorMessage } from "@/lib/error-message";
import { Spinner } from "@/shared/components/Spinner";

const planFormSchema = z.object({
  name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120, "Maksymalnie 120 znaków."),
  description: z.string().trim().max(1000, "Maksymalnie 1000 znaków."),
});

type PlanFormValues = z.infer<typeof planFormSchema>;

// null = closed; { plan: null } = create.
export type PlanFormEditing = { plan: { id: string; name: string; description: string | null } | null } | null;

interface PlanFormDialogProps {
  editing: PlanFormEditing;
  onClose: () => void;
  // Create mode: lets the caller jump straight into adding units.
  onCreated?: (planId: string, name: string) => void;
}

export function PlanFormDialog({ editing, onClose, onCreated }: PlanFormDialogProps) {
  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        {editing ? (
          <PlanFormBody key={editing.plan?.id ?? "new"} editing={editing} onClose={onClose} onCreated={onCreated} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PlanFormBody({
  editing,
  onClose,
  onCreated,
}: {
  editing: NonNullable<PlanFormEditing>;
  onClose: () => void;
  onCreated?: (planId: string, name: string) => void;
}) {
  const router = useRouter();
  const plan = editing.plan;
  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: { name: plan?.name ?? "", description: plan?.description ?? "" },
    mode: "onSubmit",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (plan) {
        await updatePlan({
          data: { planId: plan.id, name: values.name, description: values.description || undefined },
        });
        await router.invalidate();
        onClose();
      } else {
        const created = await createPlan({
          data: { name: values.name, description: values.description || undefined },
        });
        await router.invalidate();
        onClose();
        onCreated?.(created.id, values.name);
      }
    } catch (err) {
      form.setError("root.serverError", {
        type: "server",
        message: getErrorMessage(err, "Nie udało się zapisać planu."),
      });
    }
  });

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden" onSubmit={onSubmit} noValidate>
        <DialogHeader className="shrink-0">
          <DialogTitle>{plan ? "Edytuj plan" : "Nowy plan"}</DialogTitle>
          <DialogDescription>
            {plan ? "Zmień nazwę lub opis planu." : "Nazwij plan — treningi dodasz za chwilę."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nazwa</FormLabel>
                <FormControl>
                  <Input autoFocus={!plan} placeholder="np. Hardy Method" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Opis (opcjonalnie)</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="np. siła 2× w tygodniu, fokus na górę" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormRootMessage />
        </div>

        <div className="shrink-0 p-4 pt-2">
          <Button type="submit" className="w-full bg-ember shadow-ember" size="lg" disabled={isSubmitting}>
            {isSubmitting ? <Spinner size="sm" /> : plan ? "Zapisz" : "Utwórz plan"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
