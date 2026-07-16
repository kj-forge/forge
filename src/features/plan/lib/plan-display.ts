type TrainingLabelInput = {
  training: string;
  hasStrength: boolean;
  exercises: { exerciseId: string }[];
};

// The headline shown where a plan day's training would go: the written text
// if any, else "Trening siłowy" for a strength day (the exercise list is the
// content), else null so the caller renders its own empty state ("—" / a
// "brak aktywności" message).
export function planTrainingLabel(entry: TrainingLabelInput): string | null {
  if (entry.training.trim().length > 0) return entry.training;
  if (entry.hasStrength && entry.exercises.length > 0) return "Trening siłowy";
  return null;
}
