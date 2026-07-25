import { getRouteApi, useRouter } from "@tanstack/react-router";
import { ArchiveRestore, Dumbbell } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExerciseEditorDrawer } from "@/features/strength/components/ExerciseEditorDrawer";
import { EXERCISE_CATEGORY_LABEL } from "@/features/strength/constants";
import { restoreExercise } from "@/features/strength/server/exercises";
import type { ManagedExercise } from "@/features/strength/types";
import { BackLink } from "@/shared/components/BackLink";
import { Spinner } from "@/shared/components/Spinner";

const route = getRouteApi("/_shell/exercises/");

type Editor = { open: boolean; exercise: ManagedExercise | null };

export function ExercisesView() {
  const catalogue = route.useLoaderData();
  const router = useRouter();
  const [editor, setEditor] = useState<Editor>({ open: false, exercise: null });
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const active = catalogue.filter((e) => !e.isArchived);
  const archived = catalogue.filter((e) => e.isArchived);

  const handleRestore = async (exerciseId: string) => {
    setRestoringId(exerciseId);
    try {
      await restoreExercise({ data: { exerciseId } });
      await router.invalidate();
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4">
      <BackLink to="/me" label="Profil" className="pt-2" />
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl tracking-tight">Ćwiczenia</h1>
        <Button size="sm" className="bg-ember shadow-ember" onClick={() => setEditor({ open: true, exercise: null })}>
          + Dodaj ćwiczenie
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Twój katalog — zmiany widoczne w wyszukiwarce, planie i statystykach.
      </p>

      {active.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <Dumbbell className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="text-muted-foreground text-sm">Katalog jest pusty — dodaj pierwsze ćwiczenie.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="overflow-hidden rounded-xl border bg-card">
          {active.map((ex) => (
            <li key={ex.id} className="border-b last:border-b-0">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                onClick={() => setEditor({ open: true, exercise: ex })}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{ex.namePl}</p>
                  <p className="text-muted-foreground text-xs">
                    {EXERCISE_CATEGORY_LABEL[ex.category]}
                    {ex.aliases.length > 0 && ` · ${ex.aliases.join(", ")}`}
                  </p>
                </div>
                {ex.isMainLift && (
                  <span className="shrink-0 rounded-full border border-ember/40 px-2 py-0.5 font-medium text-ember text-xs">
                    bój główny
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section className="mt-2 flex flex-col gap-2">
          <h2 className="font-semibold text-muted-foreground text-sm">Zarchiwizowane</h2>
          <ul className="overflow-hidden rounded-xl border bg-card">
            {archived.map((ex) => (
              <li key={ex.id} className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate font-medium text-muted-foreground text-sm line-through">{ex.namePl}</p>
                  <p className="text-muted-foreground text-xs">{EXERCISE_CATEGORY_LABEL[ex.category]}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={restoringId !== null}
                  onClick={() => handleRestore(ex.id)}
                >
                  {restoringId === ex.id ? <Spinner size="sm" /> : <ArchiveRestore className="size-3.5" />}
                  Przywróć
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ExerciseEditorDrawer
        open={editor.open}
        exercise={editor.exercise}
        onClose={() => setEditor((e) => ({ ...e, open: false }))}
      />
    </main>
  );
}
