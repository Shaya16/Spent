import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  className?: string;
}

/**
 * A tiny trend line for showing a category's month-over-month creep inline.
 * Pure SVG so it renders identically on the server and client and adds no
 * charting dependency.
 */
export function Sparkline({ data, className }: SparklineProps) {
  if (data.length < 2) return null;
  const w = 64;
  const h = 18;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-4 w-16", className)}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
