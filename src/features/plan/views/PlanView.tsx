import { getRouteApi } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivatePlanDialog } from "@/features/plan/components/ActivatePlanDialog";
import { AddToDaySheet } from "@/features/plan/components/AddToDaySheet";
import { PlanFormDialog, type PlanFormEditing } from "@/features/plan/components/PlanFormDialog";
import { PlansTab } from "@/features/plan/components/PlansTab";
import { ScheduleTab } from "@/features/plan/components/ScheduleTab";
import { UnitDrawer, type UnitEditing } from "@/features/plan/components/UnitDrawer";
import { type ScheduleEntry, shiftWeeks } from "@/features/plan/lib/schedule";
import type { PlanWithUnits } from "@/features/plan/types";

const route = getRouteApi("/_shell/plan/");

export function PlanView() {
  const { screen, allExercises } = route.useLoaderData();
  const { tab } = route.useSearch();
  const navigate = route.useNavigate();

  const [unitEditing, setUnitEditing] = useState<UnitEditing | null>(null);
  const [planForm, setPlanForm] = useState<PlanFormEditing>(null);
  const [activating, setActivating] = useState<PlanWithUnits | null>(null);
  const [addTo, setAddTo] = useState<{ date: string; dayOfWeek: number } | null>(null);

  const setTab = (next: string) => navigate({ search: (prev) => ({ ...prev, tab: next as "harmonogram" | "plany" }) });
  const setWeek = (week: string | undefined) => navigate({ search: (prev) => ({ ...prev, week }) });

  // Schedule taps edit the live unit from the library payload (fresh data),
  // not the denormalized schedule row.
  const editEntryUnit = (entry: ScheduleEntry) => {
    const plan = screen.plans.find((p) => p.id === entry.planId);
    const unit = plan?.units.find((u) => u.id === entry.unitId);
    if (plan && unit) setUnitEditing({ planId: plan.id, planName: plan.name, unit });
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4">
      <div className="flex min-h-9 items-center justify-between gap-2 pt-2">
        <h1 className="font-bold text-2xl tracking-tight">Plan</h1>
        <Button
          className={`bg-ember shadow-ember transition-[opacity,transform] duration-200 motion-reduce:transition-none ${
            tab === "plany" ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-2 opacity-0"
          }`}
          size="sm"
          aria-hidden={tab !== "plany"}
          tabIndex={tab === "plany" ? undefined : -1}
          onClick={() => setPlanForm({ plan: null })}
        >
          <Plus className="size-4" />
          Nowy plan
        </Button>
      </div>

      {/* gap-3 + h-9! align the tab bar with the page rhythm and the h-9
          inputs around it (shadcn defaults: gap-2, h-8 — reads cramped). */}
      <Tabs value={tab} onValueChange={setTab} className="gap-3">
        <TabsList className="h-9! w-full">
          <TabsTrigger value="harmonogram">Harmonogram</TabsTrigger>
          <TabsTrigger value="plany">Moje plany</TabsTrigger>
        </TabsList>

        <TabsContent value="harmonogram">
          <ScheduleTab
            schedule={screen.schedule}
            hasAnyPlan={screen.plans.length > 0}
            onShowPlans={() => setTab("plany")}
            onPrevWeek={() => setWeek(shiftWeeks(screen.schedule.weekStart, -1))}
            onNextWeek={() => setWeek(shiftWeeks(screen.schedule.weekStart, 1))}
            onToday={() => setWeek(undefined)}
            onAddToDay={(date, dayOfWeek) => setAddTo({ date, dayOfWeek })}
            onEditEntry={editEntryUnit}
          />
        </TabsContent>

        <TabsContent value="plany">
          <PlansTab
            plans={screen.plans}
            onNewPlan={() => setPlanForm({ plan: null })}
            onEditPlan={(plan) => setPlanForm({ plan })}
            onActivate={setActivating}
            onEditUnit={setUnitEditing}
          />
        </TabsContent>
      </Tabs>

      <UnitDrawer editing={unitEditing} allExercises={allExercises} onClose={() => setUnitEditing(null)} />
      <PlanFormDialog
        editing={planForm}
        onClose={() => setPlanForm(null)}
        onCreated={(planId, name) => setUnitEditing({ planId, planName: name, unit: null })}
      />
      <ActivatePlanDialog plan={activating} onClose={() => setActivating(null)} />
      <AddToDaySheet
        date={addTo?.date ?? null}
        dayOfWeek={addTo?.dayOfWeek ?? 0}
        plans={screen.plans}
        onClose={() => setAddTo(null)}
      />
    </main>
  );
}
