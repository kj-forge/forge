import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

// Day chips index convention: 0 = poniedziałek … 6 = niedziela.
export const WEEKDAY_LABELS_PL = ["PON", "WTO", "ŚRO", "CZW", "PT", "SOB", "ND"] as const;

// The athlete's "today" is Warsaw time, not the server's UTC — this runs in
// a route loader, which executes on the server during SSR, so the zone must
// be pinned instead of trusting the runtime's local time. dayjs .day() is
// 0 = Sunday; shift to our Monday-first indexing.
export function warsawWeekday(now: Date = new Date()): number {
  return (dayjs(now).tz("Europe/Warsaw").day() + 6) % 7;
}
