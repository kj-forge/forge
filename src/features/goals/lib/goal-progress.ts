/**
 * Progress toward a numeric goal as 0-100 (clamped, rounded). Null when the
 * pair isn't comparable — no target, no measurement yet, or target <= 0.
 */
export function goalProgress(targetValue: number | null, currentValue: number | null): number | null {
  if (targetValue == null || currentValue == null || targetValue <= 0) return null;
  return Math.min(100, Math.round((currentValue / targetValue) * 100));
}
