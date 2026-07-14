import type { getTrainingPlan } from "./server/plan";

export type PlanDay = Awaited<ReturnType<typeof getTrainingPlan>>[number];
