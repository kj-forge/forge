// Round arithmetic for a step (block). Rounds save atomically ("Zapisz
// rundę"), so a round exists iff any movement has a set at that number —
// resilient to mid-circuit swaps (per-movement gaps) and legacy partial
// rounds from the removed per-exercise save.

interface MovementSets {
  sets: { setNumber: number }[];
}

export function savedRounds(movements: MovementSets[]): number {
  return new Set(movements.flatMap((m) => m.sets.map((s) => s.setNumber))).size;
}

export function maxLoggedRound(movements: MovementSets[]): number {
  return Math.max(0, ...movements.flatMap((m) => m.sets.map((s) => s.setNumber)));
}

export function currentRound(movements: MovementSets[]): number {
  return maxLoggedRound(movements) + 1;
}

export function loggedRoundNumbers(movements: MovementSets[]): number[] {
  return [...new Set(movements.flatMap((m) => m.sets.map((s) => s.setNumber)))].sort((a, b) => a - b);
}

// Soft-removed exercises stay in the step for history; they stop rendering
// inputs from the round after removedAfterRound.
export function isActiveInRound(m: { removedAfterRound: number | null }, round: number): boolean {
  return m.removedAfterRound === null || round <= m.removedAfterRound;
}
