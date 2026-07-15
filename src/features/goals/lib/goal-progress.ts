/**
 * Progress toward a numeric goal as 0-100 (clamped, rounded). Null when the
 * pair isn't comparable — no target, no measurement yet, or target <= 0.
 */
export function goalProgress(targetValue: number | null, currentValue: number | null): number | null {
  if (targetValue == null || currentValue == null || targetValue <= 0) return null;
  return Math.min(100, Math.round((currentValue / targetValue) * 100));
}

const SECOND_UNITS = new Set(["s", "sek", "sec", "seconds", "sekundy", "sekund"]);

/**
 * Display form of a goal target. Second-based units humanize to minutes —
 * "cel 3900 seconds" is a database value, not something an athlete reads.
 */
export function formatGoalTarget(targetValue: number | null, targetUnit: string | null): string | null {
  if (targetValue == null) return null;
  const unit = (targetUnit ?? "").trim();
  if (SECOND_UNITS.has(unit.toLowerCase())) {
    const minutes = targetValue / 60;
    return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
  }
  return unit ? `${targetValue} ${unit}` : `${targetValue}`;
}
