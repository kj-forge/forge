type TrainingLabelInput = {
  training: string;
  sessionType: string;
  exercises: { exerciseId: string }[];
};

// The headline shown where a unit's training would go: the written text if
// any, else "Trening siłowy" for a strength unit (the exercise list is the
// content), else null so the caller renders its own empty state ("—" / a
// "brak aktywności" message).
export function unitTrainingLabel(entry: TrainingLabelInput): string | null {
  if (entry.training.trim().length > 0) return entry.training;
  if (entry.sessionType === "STRENGTH" && entry.exercises.length > 0) return "Trening siłowy";
  return null;
}
