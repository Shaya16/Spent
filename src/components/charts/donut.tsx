import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DonutSlice {
  value: number;
  color: string;
}

interface DonutProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * A composition donut for the "where it went" breakdown. Capped to a handful of
 * segments by the caller (the rest folded into an "Other" slice) per the
 * research guidance against many-wedge pie charts.
 */
export function Donut({ slices, size = 132, thickness = 14, className, children }: DonutProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  let offset = 0;
  const segments =
    total > 0
      ? slices.map((s, i) => {
          const fraction = s.value / total;
          const dash = fraction * circumference;
          const seg = {
            key: i,
            color: s.color,
            dashArray: `${dash} ${circumference - dash}`,
            dashOffset: -offset,
          };
          offset += dash;
          return seg;
        })
      : [];

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            className="text-muted"
            stroke="currentColor"
            strokeWidth={thickness}
          />
          {segments.map((seg) => (
            <circle
              key={seg.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={seg.dashArray}
              strokeDashoffset={seg.dashOffset}
              strokeLinecap="butt"
            />
          ))}
        </g>
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      )}
    </div>
  );
}
