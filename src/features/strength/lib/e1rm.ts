/**
 * Estimated 1-rep max via the Epley formula: weight × (1 + reps/30).
 * Rounded to the nearest 0.5 kg (smallest plate increment worth showing).
 */
export function epleyE1RM(weightKg: number, reps: number): number {
  if (weightKg < 0 || reps < 1) {
    throw new RangeError(`epleyE1RM requires weightKg >= 0 and reps >= 1, got ${weightKg} × ${reps}`);
  }
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 2) / 2;
}
