import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { getPrTable, getWeekdayComparison } from "@/features/strength/server/stats";
import { StatsView } from "@/features/strength/views/StatsView";
import { getSession } from "@/lib/session";
import { SessionListSkeleton } from "@/shared/components/SessionListSkeleton";
import { warsawWeekday } from "@/shared/lib/weekday";

const searchSchema = z.object({
  seg: z.enum(["rekordy", "zestawienia"]).default("rekordy").catch("rekordy"),
  // Presence flag (?acc=1) instead of a boolean so the default URL stays bare.
  acc: z.literal(1).optional().catch(undefined),
  dzien: z.number().int().min(0).max(6).optional().catch(undefined),
});

export const Route = createFileRoute("/_shell/stats/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ seg: search.seg, acc: search.acc, dzien: search.dzien }),
  // Discriminated on seg: each segment loads only its own data, so switching
  // segments (or day chips) refetches exactly what the visible table needs.
  loader: async ({ deps }) => {
    if (deps.seg === "zestawienia") {
      const weekday = deps.dzien ?? warsawWeekday();
      return { seg: "zestawienia" as const, weekday, days: await getWeekdayComparison({ data: { weekday } }) };
    }
    return { seg: "rekordy" as const, prTable: await getPrTable({ data: { includeAccessories: deps.acc === 1 } }) };
  },
  pendingComponent: SessionListSkeleton,
  component: StatsView,
});
