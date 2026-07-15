import type { listGoals } from "./server/goals";

export type GoalRow = Awaited<ReturnType<typeof listGoals>>[number];
