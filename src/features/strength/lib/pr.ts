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

/** A PR means strictly beating the previous best's e1RM (equal is not a PR). */
export function isNewPR(candidate: PrCandidate, previousBest: PrCandidate | null): boolean {
  if (!previousBest) return true;
  return epleyE1RM(candidate.weightKg, candidate.reps) > epleyE1RM(previousBest.weightKg, previousBest.reps);
}
