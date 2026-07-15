export const GOAL_TYPES = ["STRENGTH_RM", "RACE_TIME", "BODY_COMP", "CONSISTENCY"] as const;

export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  STRENGTH_RM: "Siła (RM)",
  RACE_TIME: "Czas wyścigu",
  BODY_COMP: "Sylwetka",
  CONSISTENCY: "Regularność",
};
