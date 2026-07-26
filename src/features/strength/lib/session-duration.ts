// True workout duration: sessions get opened before the warm-up, so the
// clock starts at the first logged set, not at session creation. HYROX has
// its own timeline — the summed segments are the workout.
export function sessionDurationMin(s: {
  type: string;
  startedAt: Date | null;
  endedAt: Date | null;
  firstSetAt: Date | null;
  segmentsMs: number;
}): number | null {
  if (s.type === "HYROX" && s.segmentsMs > 0) {
    return Math.max(1, Math.round(s.segmentsMs / 60_000));
  }
  if (s.endedAt === null) return null;
  const start = s.firstSetAt ?? s.startedAt;
  if (start === null) return null;
  const min = Math.round((s.endedAt.getTime() - start.getTime()) / 60_000);
  return min >= 0 ? Math.max(1, min) : null;
}
