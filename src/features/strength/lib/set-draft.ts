import { numToInputStr } from "@/features/strength/lib/set-form";
import type { SetRow } from "@/features/strength/types";

export type RowDraft = { reps: string; weightKg: string; durationSeconds: string; rpe: string };

export const toDraft = (s: SetRow): RowDraft => ({
  reps: numToInputStr(s.reps ?? undefined),
  weightKg: numToInputStr(s.weightKg ?? undefined),
  durationSeconds: numToInputStr(s.durationSeconds ?? undefined),
  rpe: numToInputStr(s.rpe ?? undefined),
});

export const draftDirty = (s: SetRow, d: RowDraft) =>
  d.reps !== numToInputStr(s.reps ?? undefined) ||
  d.weightKg !== numToInputStr(s.weightKg ?? undefined) ||
  d.durationSeconds !== numToInputStr(s.durationSeconds ?? undefined) ||
  d.rpe !== numToInputStr(s.rpe ?? undefined);

// Payload always carries all four fields (full replace, see updateSet).
export const draftToPayload = (setId: string, d: RowDraft) => ({
  setId,
  reps: d.reps === "" ? null : Number(d.reps),
  weightKg: d.weightKg !== "" && Number(d.weightKg) > 0 ? Number(d.weightKg) : null,
  durationSeconds: d.durationSeconds === "" ? null : Number(d.durationSeconds),
  rpe: d.rpe === "" ? null : Number(d.rpe),
});
