import type { SetRow } from "../types";

// Compact set summary: reps × weight (bw shown for bodyweight, "–" for unknown).
// Used by drawer summaries and the movement row's inline preview.
export function formatSet(s: SetRow): string {
  const reps = s.reps ?? "–";
  const weight = s.weightKg !== null ? `${s.weightKg}kg` : "bw";
  return `${reps}×${weight}`;
}
