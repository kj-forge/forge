export const GOAL_TYPES = ["STRENGTH_RM", "RACE_TIME", "BODY_COMP", "CONSISTENCY"] as const;

export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  STRENGTH_RM: "Siła (RM)",
  RACE_TIME: "Czas wyścigu",
  BODY_COMP: "Sylwetka",
  CONSISTENCY: "Regularność",
};

// Per-type hints for the goal drawer — the fields mean different things
// depending on the goal type, so the labels/placeholders must follow the
// type. STRENGTH_RM has no title field at all (composed from the exercise).
export const GOAL_PLACEHOLDERS: Record<GoalType, { titleLabel: string; title: string; value: string; unit: string }> = {
  STRENGTH_RM: { titleLabel: "Tytuł", title: "", value: "np. 160", unit: "kg" },
  RACE_TIME: { titleLabel: "Rodzaj", title: 'np. "Hyrox" albo "Bieg na 5 km"', value: "np. 20", unit: "min" },
  BODY_COMP: { titleLabel: "Tytuł", title: "np. Waga docelowa 78 kg", value: "np. 78", unit: "kg" },
  CONSISTENCY: { titleLabel: "Tytuł", title: "np. 4 treningi w tygodniu", value: "np. 4", unit: "x/tydz" },
};
