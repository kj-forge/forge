import dayjs from "dayjs";

// Which training week `todayIso` falls in, for a plan's [startDate, endDate]
// window (both inclusive). null when the window is open-ended (either date
// missing) or today falls outside it — a week badge only makes sense for a
// bounded, currently-running plan.
export function planWeekProgress(
  startDate: string | null,
  endDate: string | null,
  todayIso: string,
): { week: number; totalWeeks: number } | null {
  if (!startDate || !endDate) return null;
  if (todayIso < startDate || todayIso > endDate) return null;

  const totalDays = dayjs(endDate).diff(dayjs(startDate), "day") + 1;
  const totalWeeks = Math.ceil(totalDays / 7);
  const daysSince = dayjs(todayIso).diff(dayjs(startDate), "day");
  const week = Math.min(totalWeeks, Math.floor(daysSince / 7) + 1);

  return { week, totalWeeks };
}
