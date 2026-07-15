import { getRouteApi } from "@tanstack/react-router";

import { GoalsSection } from "@/features/goals/components/GoalsSection";

const route = getRouteApi("/_shell/goals/");

export function GoalsView() {
  const { goals, exercises } = route.useLoaderData();

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-4">
      <h1 className="pt-2 font-bold text-2xl tracking-tight">Cele</h1>
      <GoalsSection goals={goals} exercises={exercises} />
    </main>
  );
}
