export const UNIT_INTENSITIES = ["HARD", "MEDIUM", "EASY"] as const;

export type UnitIntensity = (typeof UNIT_INTENSITIES)[number];

export const UNIT_INTENSITY_LABEL: Record<UnitIntensity, string> = {
  HARD: "Hard",
  MEDIUM: "Medium",
  EASY: "Easy",
};

// Semantic pill tints — only HARD borrows the ember accent; the rest stay
// off the brand hue so intensity reads as state, not decoration.
export const UNIT_INTENSITY_CLASS: Record<UnitIntensity, string> = {
  HARD: "bg-primary/15 text-primary",
  MEDIUM: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  EASY: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

// Solid variant for tiny intensity dots (dashboard week strip).
export const UNIT_INTENSITY_DOT: Record<UnitIntensity, string> = {
  HARD: "bg-primary",
  MEDIUM: "bg-amber-500",
  EASY: "bg-emerald-500",
};

export const PLAN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  DRAFT: "Szkic",
  ACTIVE: "Aktywny",
  PAUSED: "Wstrzymany",
  COMPLETED: "Zakończony",
};

export const PLAN_STATUS_CLASS: Record<PlanStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  PAUSED: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  COMPLETED: "bg-blue-400/15 text-blue-600 dark:text-blue-400",
};

export const DAY_SLOTS = ["MORNING", "EVENING"] as const;

export type DaySlot = (typeof DAY_SLOTS)[number];

export const DAY_SLOT_LABEL: Record<DaySlot, string> = { MORNING: "Rano", EVENING: "Wieczór" };
