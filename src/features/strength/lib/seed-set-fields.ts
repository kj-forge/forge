import type { LastByKind, RefKind } from "../server/sessions";
import type { SetKind } from "../types";

type SeedFields = { reps: number | undefined; weightKg: number | undefined };

// Form seed for a set kind: the latest set of that kind from the CURRENT
// session wins over the historical reference (lastByKind); neither → undefined
// so the caller leaves the fields as they are. A null weight (bodyweight)
// becomes 0 ("0 = bodyweight").
export function seedSetFields(
  sets: ReadonlyArray<{ kind: string; reps: number | null; weightKg: number | null }>,
  lastByKind: LastByKind,
  kind: SetKind,
): SeedFields | undefined {
  const sessionSet = [...sets].reverse().find((s) => s.kind === kind);
  if (sessionSet) return { reps: sessionSet.reps ?? undefined, weightKg: sessionSet.weightKg ?? 0 };

  const ref = lastByKind[kind as RefKind];
  if (!ref) return undefined;
  return { reps: ref.reps ?? undefined, weightKg: ref.weightKg ?? 0 };
}
