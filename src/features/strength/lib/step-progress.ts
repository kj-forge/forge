// Round arithmetic for a step (block). Round R = one set with setNumber R on
// every movement of the block; rounds auto-advance from data, so the UI keeps
// no round state of its own.

interface MovementSets {
  sets: { setNumber: number }[];
}

// Rounds fully logged across ALL movements (min of per-movement max).
export function completedRounds(movements: MovementSets[]): number {
  if (movements.length === 0) return 0;
  return Math.min(...movements.map((m) => Math.max(0, ...m.sets.map((s) => s.setNumber))));
}

// Highest round touched by ANY movement — the target of "usuń ostatnią rundę".
export function maxLoggedRound(movements: MovementSets[]): number {
  return Math.max(0, ...movements.flatMap((m) => m.sets.map((s) => s.setNumber)));
}

// The round the inputs should show: the workout's FRONTIER, not the lowest
// common round. Max logged round while anyone still owes it a set; +1 once
// everyone has it. An exercise added mid-step (morph) therefore joins the
// round in progress instead of dragging the counter back to its own round 1
// and backfilling history.
export function currentRound(movements: MovementSets[]): number {
  const frontier = maxLoggedRound(movements);
  if (frontier === 0) return 1;
  const everyone = movements.every((m) => m.sets.some((s) => s.setNumber === frontier));
  return everyone ? frontier + 1 : frontier;
}
