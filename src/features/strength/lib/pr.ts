import { epleyE1RM } from "./e1rm";

export type PrCandidate = {
  weightKg: number;
  reps: number;
};

type SetLike = {
  weightKg: number | null;
  reps: number | null;
  kind: string;
};

/**
 * Heaviest qualifying set: max weight, ties broken by reps. Warmups and
 * sets without weight or reps (bodyweight / incomplete) never qualify.
 */
export function bestSet(sets: SetLike[]): PrCandidate | null {
  let best: PrCandidate | null = null;
  for (const set of sets) {
    if (set.kind === "WARMUP" || set.weightKg == null || set.reps == null) continue;
    if (!best || set.weightKg > best.weightKg || (set.weightKg === best.weightKg && set.reps > best.reps)) {
      best = { weightKg: set.weightKg, reps: set.reps };
    }
  }
  return best;
}

/**
 * A record is real weight on the bar, not an estimate: more weight than the
 * previous best set, or the same weight for strictly more reps. 130×1 beats
 * 129×5 — e1RM stays a stats-page estimate and never declares records.
 */
export function isNewPR(candidate: PrCandidate, previousBest: PrCandidate | null): boolean {
  if (!previousBest) return true;
  return (
    candidate.weightKg > previousBest.weightKg ||
    (candidate.weightKg === previousBest.weightKg && candidate.reps > previousBest.reps)
  );
}

/**
 * Highest e1RM across qualifying sets — the record to beat. Distinct from
 * bestSet: the heaviest set (110×1) can carry a LOWER e1RM than a lighter
 * rep set (100×10), and the celebration must compare against the true max.
 */
export function bestE1RM(sets: SetLike[]): number | null {
  let best: number | null = null;
  for (const set of sets) {
    if (set.kind === "WARMUP" || set.weightKg == null || set.reps == null || set.reps < 1) continue;
    const e1rm = epleyE1RM(set.weightKg, set.reps);
    if (best === null || e1rm > best) best = e1rm;
  }
  return best;
}
