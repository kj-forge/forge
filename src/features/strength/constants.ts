import type { SessionType, SetKind } from "./types";

// Full DB enum — used for type-narrowing legacy data (WORK, FAILURE, DROP_SET)
// even though the picker shows only the three most-used kinds.
export const SET_KINDS = ["WARMUP", "TOP_SET", "WORK", "BACK_OFF", "FAILURE", "DROP_SET"] as const;

export const SESSION_TYPES = [
  "STRENGTH",
  "HYROX_EMOM",
  "HYROX_AMRAP",
  "HYROX_WORK",
  "CARDIO",
  "COMPROMISED_RUN",
  "REHAB",
  "MOBILITY",
] as const;

export const SESSION_TYPE_LABEL_PL: Record<SessionType, string> = {
  STRENGTH: "Siła",
  HYROX_EMOM: "Hyrox EMOM",
  HYROX_AMRAP: "Hyrox AMRAP",
  HYROX_WORK: "Hyrox WORK",
  CARDIO: "Cardio",
  COMPROMISED_RUN: "Compromised run",
  REHAB: "Rehab",
  MOBILITY: "Mobility",
};

export const SESSION_TYPE_LABEL_PL_ADJ: Record<SessionType, string> = {
  STRENGTH: "siłowa",
  HYROX_EMOM: "Hyrox EMOM",
  HYROX_AMRAP: "Hyrox AMRAP",
  HYROX_WORK: "Hyrox WORK",
  CARDIO: "cardio",
  COMPROMISED_RUN: "compromised run",
  REHAB: "rehab",
  MOBILITY: "mobility",
};

// Chips actually shown in the picker. DB enum still accepts all six (and the
// label/color maps below cover them) so historical sets render correctly, but
// the user-facing picker is trimmed to the three most-used kinds.
export const VISIBLE_SET_KINDS: readonly SetKind[] = ["WARMUP", "TOP_SET", "BACK_OFF"];

export const SET_KIND_LABEL: Record<SetKind, string> = {
  WARMUP: "Rozgrzewka",
  TOP_SET: "Top set",
  WORK: "Robocza",
  BACK_OFF: "Back-off",
  FAILURE: "Do upadku",
  DROP_SET: "Drop set",
};

// Emoji split out from the label so it can be used sparingly — only as a
// once-per-kind header in the session details. Inline/repeated places use
// SET_KIND_COLOR instead, so the icon never stacks down a list.
export const SET_KIND_ICON: Record<SetKind, string> = {
  WARMUP: "🔥",
  TOP_SET: "⭐",
  WORK: "•",
  BACK_OFF: "💪",
  FAILURE: "⚠️",
  DROP_SET: "↘",
};

export const SET_KIND_COLOR: Record<SetKind, string> = {
  WARMUP: "text-muted-foreground",
  TOP_SET: "text-orange-600 dark:text-orange-400",
  WORK: "text-foreground",
  BACK_OFF: "text-emerald-600 dark:text-emerald-400",
  FAILURE: "text-red-600 dark:text-red-400",
  DROP_SET: "text-purple-600 dark:text-purple-400",
};

// Visual order in ViewOnlyExerciseDrawer (typical session flow:
// warm up → top → working → back off → tail).
export const SET_KIND_DISPLAY_ORDER: SetKind[] = ["WARMUP", "TOP_SET", "WORK", "BACK_OFF", "FAILURE", "DROP_SET"];
