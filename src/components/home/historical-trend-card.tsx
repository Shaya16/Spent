"use client";

import { useState } from "react";
import { CardShell } from "./card-shell";
import { formatCurrency } from "@/lib/formatters";
import type { HomeHistoricalTrendPoint } from "@/lib/types";

interface Props {
  data: HomeHistoricalTrendPoint[];
}

export function HistoricalTrendCard({ data }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hasData = data.some((d) => d.total > 0);

  if (!hasData) {
    return (
      <CardShell label="Last 8 months">
        <div className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground">
          Not enough history yet.
        </div>
      </CardShell>
    );
  }

  const max = Math.max(...data.map((d) => d.total));
  const active = hoverIdx != null ? data[hoverIdx] : data[data.length - 1];

  return (
    <CardShell label="Last 8 months">
      <div className="flex flex-1 flex-col justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-2xl tabular-nums">
              {formatCurrency(active.total)}
            </span>
            <span className="text-xs text-muted-foreground">
              {active.label}
              {active.isCurrent ? " (so far)" : ""}
            </span>
          </div>
        </div>

        <BarChart
          data={data}
          max={max}
          hoverIdx={hoverIdx}
          onHover={setHoverIdx}
        />
      </div>
    </CardShell>
  );
}

function BarChart({
  data,
  max,
  hoverIdx,
  onHover,
}: {
  data: HomeHistoricalTrendPoint[];
  max: number;
  hoverIdx: number | null;
  onHover: (i: number | null) => void;
}) {
  const width = 100;
  const height = 36;
  const barWidth = width / data.length;
  const innerBarWidth = barWidth * 0.6;
  const barGap = (barWidth - innerBarWidth) / 2;

  return (
    <div className="flex flex-col gap-2" onMouseLeave={() => onHover(null)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-24 w-full"
      >
        {data.map((d, i) => {
          const h = max > 0 ? (d.total / max) * (height - 2) : 0;
          const x = i * barWidth + barGap;
          const y = height - h;
          const isHovered = hoverIdx === i;
          const opacity = hoverIdx == null
            ? d.isCurrent ? 1 : 0.55
            : isHovered ? 1 : 0.3;
          return (
            <rect
              key={d.month}
              x={x}
              y={y}
              width={innerBarWidth}
              height={Math.max(h, 0.5)}
              fill="currentColor"
              opacity={opacity}
              rx={0.6}
              className="cursor-pointer text-foreground transition-opacity"
              onMouseEnter={() => onHover(i)}
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
        {data.map((d) => (
          <span
            key={d.month}
            className={d.isCurrent ? "font-medium text-foreground" : ""}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
