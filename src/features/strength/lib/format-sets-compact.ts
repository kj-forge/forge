type SetLike = {
  weightKg: number | null;
  reps: number | null;
  kind: string;
};

type Options = {
  // Pull-up/dip style exercises: weightKg is ADDED load, shown as "+20".
  loadedBodyweight?: boolean;
};

// KJ's notebook notation for one session's sets of a single exercise:
// "105 4×5" (equal sets), "110 3/3/3/5" (varied reps), "112.5 ×3" (single
// set), "12/12/10" (bodyweight — reps only), groups per weight joined by
// " · " in set order. Warmups are noise here and are dropped.
export function formatSetsCompact(sets: SetLike[], opts: Options = {}): string {
  const working = sets.flatMap((s) =>
    s.kind !== "WARMUP" && s.reps != null ? [{ weightKg: s.weightKg, reps: s.reps }] : [],
  );
  if (working.length === 0) return "—";

  const groups: { weightKg: number | null; reps: number[] }[] = [];
  for (const s of working) {
    const group = groups.find((g) => g.weightKg === s.weightKg);
    if (group) group.reps.push(s.reps);
    else groups.push({ weightKg: s.weightKg, reps: [s.reps] });
  }

  return groups
    .map((g) => {
      const weight = g.weightKg === null ? "" : opts.loadedBodyweight ? `+${g.weightKg} ` : `${g.weightKg} `;
      if (g.reps.length === 1) return `${weight}×${g.reps[0]}`;
      const allEqual = g.reps.every((r) => r === g.reps[0]);
      if (allEqual) return `${weight}${g.reps.length}×${g.reps[0]}`;
      return `${weight}${g.reps.join("/")}`;
    })
    .join(" · ");
}
