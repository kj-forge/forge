import { useId } from "react";

export type E1rmChartPoint = { date: string; e1rm: number };

// Shared e1RM polyline (dashboard trend tile + exercise stats). Pure SVG:
// x spread evenly per session, y normalized to the value range.
export function E1rmSparkline({ points, className = "h-16 w-full" }: { points: E1rmChartPoint[]; className?: string }) {
  const gradientId = useId();
  const values = points.map((p) => p.e1rm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const width = 600;
  const height = 64;
  const pad = 8;
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: pad + i * step,
    y: height - pad - ((p.e1rm - min) / spread) * (height - pad * 2),
  }));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label="Trend e1RM"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.45" />
          <stop offset="1" stopColor="var(--primary)" />
        </linearGradient>
      </defs>
      <polyline
        points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="3.5" fill="var(--primary)" />
    </svg>
  );
}

export function formatChartDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
