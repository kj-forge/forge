import type { SessionType, SetKind } from "./types";

// Full DB enum — used for type-narrowing legacy data (WORK, FAILURE, DROP_SET)
// even though the picker shows only the three most-used kinds.
export const SET_KINDS = ["WARMUP", "TOP_SET", "WORK", "BACK_OFF", "FAILURE", "DROP_SET"] as const;

// NOTE (ADR-0020): the old ACCESSORY_SLUGS / PR_TABLE_SLUG_ORDER /
// LOADED_BW_SLUGS constants are gone — exercises are per-athlete, editable
// rows now, so those behaviours live on per-row flags (isMainLift,
// isLoadedBodyweight) instead of hardcoded slugs.

export const EXERCISE_CATEGORIES = ["MAIN_LIFT", "ACCESSORY", "BODYWEIGHT", "HYROX_STATION", "REHAB"] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const EXERCISE_CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  MAIN_LIFT: "Bój główny",
  ACCESSORY: "Akcesoryjne",
  BODYWEIGHT: "Masa ciała",
  HYROX_STATION: "Stacja Hyrox",
  REHAB: "Rehab",
};

export const EXERCISE_UNITS = ["REPS", "TIME", "DISTANCE", "CALORIES"] as const;
export type ExerciseUnit = (typeof EXERCISE_UNITS)[number];

export const EXERCISE_UNIT_LABEL: Record<ExerciseUnit, string> = {
  REPS: "Powtórzenia",
  TIME: "Czas",
  DISTANCE: "Dystans",
  CALORIES: "Kalorie",
};

export const SESSION_TYPES = [
  "STRENGTH",
  "HYROX",
  "RUNNING",
  "OTHER",
  "HYROX_EMOM",
  "HYROX_AMRAP",
  "HYROX_WORK",
  "CARDIO",
  "COMPROMISED_RUN",
  "REHAB",
  "MOBILITY",
] as const;

// What the new-session picker offers. The DB enum still accepts the granular
// early-design values so historical rows render, but users pick from four.
export const PICKABLE_SESSION_TYPES = [
  "STRENGTH",
  "HYROX",
  "RUNNING",
  "OTHER",
] as const satisfies readonly SessionType[];

export const SESSION_TYPE_LABEL_PL: Record<SessionType, string> = {
  STRENGTH: "Siła",
  HYROX: "Hyrox",
  RUNNING: "Bieganie",
  OTHER: "Inny",
  HYROX_EMOM: "Hyrox EMOM",
  HYROX_AMRAP: "Hyrox AMRAP",
  HYROX_WORK: "Hyrox WORK",
  CARDIO: "Cardio",
  COMPROMISED_RUN: "Compromised run",
  REHAB: "Rehab",
  MOBILITY: "Mobility",
};

// "Nowa sesja {adj}" — OTHER stays empty so the heading reads plain "Nowa sesja".
export const SESSION_TYPE_LABEL_PL_ADJ: Record<SessionType, string> = {
  STRENGTH: "siłowa",
  HYROX: "Hyrox",
  RUNNING: "biegowa",
  OTHER: "",
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

export const SET_KIND_COLOR: Record<SetKind, string> = {
  WARMUP: "text-muted-foreground",
  TOP_SET: "text-orange-600 dark:text-orange-400",
  WORK: "text-foreground",
  BACK_OFF: "text-emerald-600 dark:text-emerald-400",
  FAILURE: "text-red-600 dark:text-red-400",
  DROP_SET: "text-purple-600 dark:text-purple-400",
};

// Visual order of per-kind lines in the active-session MovementRow preview
// (typical session flow: warm up → top → working → back off → tail).
export const SET_KIND_DISPLAY_ORDER: SetKind[] = ["WARMUP", "TOP_SET", "WORK", "BACK_OFF", "FAILURE", "DROP_SET"];
