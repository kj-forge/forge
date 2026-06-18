import { VISIBLE_SET_KINDS } from "../constants";
import type { Movement, SetKind } from "../types";

// Picks the most likely SetKind for the NEXT set in this movement, used as the
// initial value of the ExerciseDrawer's chip selector. Returns a value in
// VISIBLE_SET_KINDS so the selected chip is always highlighted; legacy WORK /
// FAILURE / DROP_SET in historical data fall back to BACK_OFF.
export function suggestKind(movement: Movement): SetKind {
  if (movement.sets.length === 0) return "WARMUP";

  const lastSet = movement.sets[movement.sets.length - 1];
  const lastWorkSet = [...movement.sets].reverse().find((s) => s.kind !== "WARMUP");

  // After a TOP_SET, suggest BACK_OFF if the next weight is lower.
  if (
    lastWorkSet &&
    lastSet &&
    lastWorkSet.kind === "TOP_SET" &&
    lastSet.weightKg !== null &&
    (lastSet.weightKg ?? 0) < (lastWorkSet.weightKg ?? 0)
  ) {
    return "BACK_OFF";
  }

  const last = lastSet?.kind as SetKind | undefined;
  if (last && VISIBLE_SET_KINDS.includes(last)) return last;
  return "BACK_OFF";
}
