import type { getPlanScreen } from "./server/plan";

export type PlanScreenData = Awaited<ReturnType<typeof getPlanScreen>>;
export type WeekSchedule = PlanScreenData["schedule"];
export type PlanWithUnits = PlanScreenData["plans"][number];
export type PlanUnit = PlanWithUnits["units"][number];
