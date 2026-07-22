// Hyrox unit editor logic: block drafts (strings for iOS-safe inputs) ↔ the
// upsertUnit steps payload ↔ persisted unit steps. Pure, so the drawer and
// tests share one source of truth.

export interface HyroxStationDraft {
  key: string;
  exerciseId: string;
  namePl: string;
  defaultUnit: "REPS" | "TIME" | "DISTANCE" | "CALORIES";
  target: string;
}

export interface HyroxBlockDraft {
  key: string;
  stations: HyroxStationDraft[];
  rounds: string;
  restMinutes: string;
}

interface PersistedHyroxStep {
  id: string;
  kind: "STRAIGHT_SETS" | "REST";
  targetRounds: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  note: string | null;
  exercises: {
    exerciseId: string;
    namePl: string;
    defaultUnit: HyroxStationDraft["defaultUnit"];
    targetReps: number | null;
    targetDistanceM: number | null;
  }[];
}

export interface HyroxStepExercisePayload {
  exerciseId: string;
  targetReps?: number;
  targetDistanceM?: number;
}

export interface HyroxStepPayload {
  kind: "STRAIGHT_SETS";
  targetRounds: number;
  restSeconds?: number;
  exercises: HyroxStepExercisePayload[];
}

export function hyroxDraftsFromUnitSteps(steps: PersistedHyroxStep[] | undefined): HyroxBlockDraft[] {
  return (steps ?? [])
    .filter((s) => s.kind === "STRAIGHT_SETS")
    .map((s) => ({
      key: s.id,
      rounds: s.targetRounds !== null ? String(s.targetRounds) : "",
      restMinutes: s.restSeconds !== null ? String(Math.round((s.restSeconds / 60) * 10) / 10) : "",
      stations: s.exercises.map((e, i) => ({
        key: `${s.id}-${i}`,
        exerciseId: e.exerciseId,
        namePl: e.namePl,
        defaultUnit: e.defaultUnit,
        target:
          e.targetReps !== null ? String(e.targetReps) : e.targetDistanceM !== null ? String(e.targetDistanceM) : "",
      })),
    }));
}

export function hyroxStepsPayload(drafts: HyroxBlockDraft[]): HyroxStepPayload[] {
  return drafts.map((b) => ({
    kind: "STRAIGHT_SETS" as const,
    targetRounds: Number(b.rounds),
    restSeconds: b.restMinutes ? Math.round(Number(b.restMinutes) * 60) : undefined,
    exercises: b.stations.map((s) => {
      const target = s.target ? Number(s.target) : undefined;
      if (target === undefined) return { exerciseId: s.exerciseId };
      if (s.defaultUnit === "REPS") return { exerciseId: s.exerciseId, targetReps: target };
      if (s.defaultUnit === "DISTANCE") return { exerciseId: s.exerciseId, targetDistanceM: target };
      return { exerciseId: s.exerciseId };
    }),
  }));
}

export function validateHyroxBlocks(drafts: HyroxBlockDraft[]): string | null {
  if (drafts.length === 0) return "Dodaj przynajmniej jeden blok.";
  for (const [i, b] of drafts.entries()) {
    const label = `Blok ${String.fromCharCode(65 + i)}`;
    if (b.stations.length === 0) return `${label}: dodaj przynajmniej jedną stację.`;
    const rounds = Number(b.rounds);
    if (!b.rounds || !Number.isInteger(rounds) || rounds < 1 || rounds > 30)
      return `${label}: podaj liczbę rund (1–30).`;
    if (b.restMinutes) {
      const restSeconds = Math.round(Number(b.restMinutes) * 60);
      if (restSeconds < 5 || restSeconds > 3600) return `${label}: przerwa musi mieścić się w 5 s – 60 min.`;
    }
    for (const s of b.stations) {
      if (s.target && (!Number.isInteger(Number(s.target)) || Number(s.target) < 1))
        return `${label}: target stacji „${s.namePl}” musi być dodatnią liczbą całkowitą.`;
    }
  }
  return null;
}
