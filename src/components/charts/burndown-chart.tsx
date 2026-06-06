import { cn } from "@/lib/utils";

interface BurndownChartProps {
  /** Cumulative spend by day this month, up to today. */
  current: number[];
  /** Cumulative spend by day across the whole prior month (the baseline). */
  prior: number[];
  totalDays: number;
  labels: { thisMonth: string; lastMonth: string };
  className?: string;
}

const W = 100;
const H = 44;

function path(values: number[], span: number, max: number): string {
  if (values.length === 0) return "";
  return values
    .map((v, i) => {
      const x = span > 1 ? (i / (span - 1)) * W : 0;
      const y = H - (max > 0 ? (v / max) * (H - 2) : 0) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * Cumulative spend this month overlaid on last month's full curve. Above the
 * baseline means spending faster than usual; below means slower. Frames pace
 * against the user's own past, never a budget.
 */
export function BurndownChart({
  current,
  prior,
  totalDays,
  labels,
  className,
}: BurndownChartProps) {
  const max = Math.max(...current, ...prior, 1);
  const currentPath = path(current, totalDays, max);
  const priorPath = path(prior, prior.length, max);
  const areaPath = currentPath
    ? `${currentPath} L${(((current.length - 1) / Math.max(totalDays - 1, 1)) * W).toFixed(2)} ${H} L0 ${H} Z`
    : "";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-20 w-full overflow-visible"
        aria-hidden
      >
        <title>Cumulative spend this month vs last month</title>
        <defs>
          <linearGradient id="burndownFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        {priorPath && (
          <path
            d={priorPath}
            fill="none"
            className="text-muted-foreground/50"
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {areaPath && <path d={areaPath} fill="url(#burndownFill)" className="text-foreground" />}
        {currentPath && (
          <path
            d={currentPath}
            fill="none"
            className="text-foreground"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-foreground" />
          {labels.thisMonth}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-3 border-t border-dashed border-muted-foreground/60" />
          {labels.lastMonth}
        </span>
      </div>
    </div>
  );
}
