import { useRouter } from "@tanstack/react-router";
import { CalendarDays, Dumbbell, Pause, Play, Plus } from "lucide-react";
import { useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PLAN_STATUS_CLASS, PLAN_STATUS_LABEL } from "@/features/plan/constants";
import { warsawTodayIso } from "@/features/plan/lib/schedule";
import { completePlan, pausePlan } from "@/features/plan/server/plan";
import type { PlanWithUnits } from "@/features/plan/types";
import { SESSION_TYPE_LABEL_PL } from "@/features/strength/constants";
import { getErrorMessage } from "@/lib/error-message";
import { SearchInput } from "@/shared/components/SearchInput";
import { Spinner } from "@/shared/components/Spinner";
import { WEEKDAY_LABELS_PL } from "@/shared/lib/weekday";
import type { UnitEditing } from "./UnitDrawer";

const RANGE_FMT = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" });

interface PlansTabProps {
  plans: PlanWithUnits[];
  onNewPlan: () => void;
  onEditPlan: (plan: PlanWithUnits) => void;
  onActivate: (plan: PlanWithUnits) => void;
  onEditUnit: (editing: UnitEditing) => void;
}

function planMatches(plan: PlanWithUnits, q: string): boolean {
  if (plan.name.toLowerCase().includes(q)) return true;
  return plan.units.some(
    (u) => u.name.toLowerCase().includes(q) || SESSION_TYPE_LABEL_PL[u.sessionType].toLowerCase().includes(q),
  );
}

export function PlansTab({ plans, onNewPlan, onEditPlan, onActivate, onEditUnit }: PlansTabProps) {
  const [query, setQuery] = useState("");
  // Active plans start expanded; the rest collapsed. While searching, the
  // matched plans are force-opened so the hit is visible.
  const [open, setOpen] = useState<string[]>(() => plans.filter((p) => p.status === "ACTIVE").map((p) => p.id));

  const q = query.trim().toLowerCase();
  const visible = q ? plans.filter((p) => planMatches(p, q)) : plans;

  if (plans.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <CalendarDays className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
          <p className="text-muted-foreground text-sm">
            Nie masz jeszcze planów. Stwórz plan, dodaj treningi i aktywuj go na wybrane dni tygodnia.
          </p>
          <Button className="bg-ember shadow-ember" size="lg" onClick={onNewPlan}>
            Nowy plan
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        placeholder="Szukaj: plan, trening lub typ…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {visible.length === 0 ? (
        <p className="py-4 text-center text-muted-foreground text-sm">Brak planów pasujących do „{query.trim()}”.</p>
      ) : (
        <Accordion
          type="multiple"
          className="gap-3"
          value={q ? visible.map((p) => p.id) : open}
          onValueChange={(next) => {
            if (!q) setOpen(next);
          }}
        >
          {visible.map((plan) => (
            <PlanAccordionItem
              key={plan.id}
              plan={plan}
              onEditPlan={onEditPlan}
              onActivate={onActivate}
              onEditUnit={onEditUnit}
            />
          ))}
        </Accordion>
      )}

      <Button variant="outline" className="w-full" onClick={onNewPlan}>
        <Plus className="size-4" />
        Nowy plan
      </Button>
    </div>
  );
}

function PlanAccordionItem({
  plan,
  onEditPlan,
  onActivate,
  onEditUnit,
}: {
  plan: PlanWithUnits;
  onEditPlan: (plan: PlanWithUnits) => void;
  onActivate: (plan: PlanWithUnits) => void;
  onEditUnit: (editing: UnitEditing) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await router.invalidate();
    } catch (err) {
      setError(getErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const expired = plan.status === "ACTIVE" && plan.endDate !== null && plan.endDate < warsawTodayIso();
  const range =
    plan.startDate &&
    `${RANGE_FMT.format(new Date(`${plan.startDate}T00:00:00`))} – ${
      plan.endDate ? RANGE_FMT.format(new Date(`${plan.endDate}T00:00:00`)) : "∞"
    }`;

  return (
    <AccordionItem value={plan.id} className="rounded-xl border bg-card px-4">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-2">
          <span className="min-w-0">
            <span className="block truncate font-semibold">{plan.name}</span>
            <span className="block truncate font-normal text-muted-foreground text-xs">
              {plan.units.length > 0
                ? `${plan.units.length} ${plan.units.length === 1 ? "trening" : plan.units.length < 5 ? "treningi" : "treningów"}`
                : "bez treningów"}
              {plan.status !== "DRAFT" && range ? ` · ${range}` : ""}
            </span>
          </span>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 font-bold text-[10px] uppercase tracking-wide ${PLAN_STATUS_CLASS[plan.status]}`}
          >
            {expired ? "Po terminie" : PLAN_STATUS_LABEL[plan.status]}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        {plan.description && <p className="mb-2 text-muted-foreground text-xs">{plan.description}</p>}

        {plan.units.length > 0 ? (
          <ul className="mb-3 space-y-1">
            {plan.units.map((unit) => (
              <li key={unit.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                  onClick={() => onEditUnit({ planId: plan.id, planName: plan.name, unit })}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {unit.sessionType === "STRENGTH" && <Dumbbell className="size-3 shrink-0 text-primary" />}
                    <span className="truncate">{unit.name}</span>
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {SESSION_TYPE_LABEL_PL[unit.sessionType]}
                    </span>
                  </span>
                  {unit.days.length > 0 && (
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {unit.days.map((d) => WEEKDAY_LABELS_PL[d]).join(" · ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-muted-foreground text-xs">Dodaj treningi, żeby móc aktywować plan.</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onEditUnit({ planId: plan.id, planName: plan.name, unit: null })}
          >
            <Plus className="size-3.5" />
            Trening
          </Button>

          {(plan.status === "DRAFT" || plan.status === "PAUSED" || plan.status === "COMPLETED") && (
            <Button
              size="sm"
              className="bg-ember"
              disabled={busy || plan.units.length === 0}
              onClick={() => onActivate(plan)}
            >
              <Play className="size-3.5" />
              {plan.status === "DRAFT" ? "Aktywuj" : "Aktywuj ponownie"}
            </Button>
          )}

          {plan.status === "ACTIVE" && (
            <>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => onActivate(plan)}>
                Zmień dni
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => run(() => pausePlan({ data: { planId: plan.id } }), "Nie udało się wstrzymać planu.")}
              >
                <Pause className="size-3.5" />
                Wstrzymaj
              </Button>
              {expired && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(() => completePlan({ data: { planId: plan.id } }), "Nie udało się zakończyć planu.")
                  }
                >
                  Zakończ
                </Button>
              )}
            </>
          )}

          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onEditPlan(plan)}>
            Edytuj
          </Button>

          {busy && <Spinner size="sm" className="text-muted-foreground" />}
        </div>
        {error && <p className="mt-2 font-medium text-destructive text-sm">{error}</p>}
      </AccordionContent>
    </AccordionItem>
  );
}
