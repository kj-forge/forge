export const GOAL_TYPES = ["STRENGTH_RM", "RACE_TIME", "BODY_COMP", "CONSISTENCY"] as const;

export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  STRENGTH_RM: "Siła (RM)",
  RACE_TIME: "Czas wyścigu",
  BODY_COMP: "Sylwetka",
  CONSISTENCY: "Regularność",
};

// Per-type hints for the goal drawer — the fields mean different things
// depending on the goal type, so the placeholders must follow the type.
export const GOAL_PLACEHOLDERS: Record<GoalType, { title: string; value: string; unit: string }> = {
  STRENGTH_RM: { title: "np. Wyciskanie na ławce 100 kg", value: "np. 100", unit: "kg" },
  RACE_TIME: { title: "np. 5 km w 20 min", value: "np. 20", unit: "min" },
  BODY_COMP: { title: "np. Waga docelowa 78 kg", value: "np. 78", unit: "kg" },
  CONSISTENCY: { title: "np. 4 treningi w tygodniu", value: "np. 4", unit: "x/tydz" },
};
