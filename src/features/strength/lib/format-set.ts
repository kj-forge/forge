import type { SetRow } from "../types";

// "132.5kg" for loaded, "bw" for bodyweight. Split out so the session card can
// emphasise the weight on its own while reusing the same convention as formatSet.
export function formatWeight(weightKg: number | null): string {
  return weightKg !== null ? `${weightKg}kg` : "bw";
}

// Compact set summary: reps × weight (bw shown for bodyweight, "–" for unknown).
// Used by drawer summaries, the movement row's inline preview, and the session
// card's top-set line — hence the narrow Pick rather than a full SetRow.
export function formatSet(s: Pick<SetRow, "reps" | "weightKg">): string {
  const reps = s.reps ?? "–";
  return `${reps}× ${formatWeight(s.weightKg)}`;
}

// "1 seria" / "2 serie" / "5 serii" — Polish plural: 2-4 take "serie" except
// the teens (12-14), everything else "serii".
export function formatSeriesCount(n: number): string {
  if (n === 1) return "1 seria";
  const lastTwo = n % 100;
  const last = n % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} serie`;
  return `${n} serii`;
}
