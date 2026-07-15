export const PLAN_INTENSITIES = ["HARD", "MEDIUM", "EASY", "RESET"] as const;

export type PlanIntensity = (typeof PLAN_INTENSITIES)[number];

export const PLAN_INTENSITY_LABEL: Record<PlanIntensity, string> = {
  HARD: "Hard",
  MEDIUM: "Medium",
  EASY: "Easy",
  RESET: "Reset",
};

// Semantic pill tints — only HARD borrows the ember accent; the rest stay
// off the brand hue so intensity reads as state, not decoration.
export const PLAN_INTENSITY_CLASS: Record<PlanIntensity, string> = {
  HARD: "bg-primary/15 text-primary",
  MEDIUM: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  EASY: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  RESET: "bg-blue-400/15 text-blue-600 dark:text-blue-400",
};

// Solid variant for tiny intensity dots (dashboard week strip).
export const PLAN_INTENSITY_DOT: Record<PlanIntensity, string> = {
  HARD: "bg-primary",
  MEDIUM: "bg-amber-500",
  EASY: "bg-emerald-500",
  RESET: "bg-blue-400",
};
