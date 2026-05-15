"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import type { DashboardSummary } from "@/lib/types";

interface HeroCardProps {
  data: DashboardSummary | undefined;
  loading: boolean;
}

export function HeroCard({ data, loading }: HeroCardProps) {
  if (loading || !data) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const {
    pacePhrase,
    periodTotal,
    budgetedSpent,
    totalBudget,
    timeElapsedPercent,
    daysUntilPayday,
    todayLabel,
    categoriesWithData,
    typicalMonthly,
  } = data;
  const hasBudget = totalBudget > 0;

  // Top 4 categories for the stacked bar + legend, then "+X more".
  // Use the rollup view (parents + orphan leaves) so children don't
  // double-count alongside their parents.
  const parentIdsWithRollup = new Set(
    categoriesWithData.filter((c) => c.isParent).map((c) => c.categoryId)
  );
  const sorted = [...categoriesWithData]
    .filter(
      (c) =>
        c.spent > 0 &&
        (c.isParent ||
          c.parentId == null ||
          !parentIdsWithRollup.has(c.parentId))
    )
    .sort((a, b) => b.spent - a.spent);
  const topFour = sorted.slice(0, 4);
  const rest = sorted.slice(4);
  const restTotal = rest.reduce((sum, c) => sum + c.spent, 0);
  const grandTotal = sorted.reduce((sum, c) => sum + c.spent, 0);

  const legend = [
    ...topFour.map((c) => ({
      name: c.categoryName,
      color: c.categoryColor,
      amount: c.spent,
      pct: grandTotal > 0 ? (c.spent / grandTotal) * 100 : 0,
    })),
    ...(rest.length > 0
      ? [
          {
            name: `+${rest.length} more`,
            color: "#B1AA9C",
            amount: restTotal,
            pct: grandTotal > 0 ? (restTotal / grandTotal) * 100 : 0,
          },
        ]
      : []),
  ];

  const heroPhrase = renderPhrase(
    pacePhrase,
    hasBudget ? budgetedSpent : periodTotal
  );

  const ctaLabel = typicalMonthly
    ? `Set a monthly target (₪${typicalMonthly.toLocaleString("en-IL")} typical) →`
    : `Set a monthly target to see how you're pacing →`;

  const body = (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {todayLabel}
        {" · "}
        You have <span className="font-medium text-foreground">{daysUntilPayday} {daysUntilPayday === 1 ? "day" : "days"}</span>{" "}
        until payday
      </p>
      <h2 className="font-serif text-3xl leading-[1.05] tracking-tighter md:text-4xl lg:text-5xl">
        {heroPhrase}
      </h2>
      {legend.length > 0 && (
        <div className="space-y-3 pt-2">
          <StackedBar legend={legend} />
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {legend.map((seg) => (
              <div
                key={seg.name}
                className="flex items-center gap-2"
              >
                <div
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="font-medium">{seg.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCurrency(seg.amount)} {"·"}{" "}
                  {Math.round(seg.pct)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!hasBudget && (
        <div className="pt-1">
          <Link
            href="/settings/general#section-monthly-target"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {ctaLabel}
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 md:p-8 lg:p-10">
      {hasBudget ? (
        <div className="grid gap-6 md:grid-cols-[200px_1fr] md:gap-10 lg:grid-cols-[240px_1fr]">
          <div className="flex flex-col items-center justify-center gap-2">
            <PaceGauge
              periodTotal={periodTotal}
              budgetedSpent={budgetedSpent}
              totalBudget={totalBudget}
              timeElapsedPercent={timeElapsedPercent}
            />
          </div>
          {body}
        </div>
      ) : (
        body
      )}
    </div>
  );
}

function renderPhrase(phrase: string, total: number) {
  // Split on the spend amount so we can style it serif-bold,
  // and on the pace keyword so we can color-emphasize it.
  const amountStr = `₪${Math.round(total).toLocaleString("en-IL")}`;
  const parts = phrase.split(amountStr);
  if (parts.length !== 2) {
    return <span>{phrase}</span>;
  }
  const after = parts[1];

  // Find the keyword that indicates pace tone
  const tones: [string, string][] = [
    ["over budget", "text-[var(--status-over)]"],
    ["over schedule", "text-[var(--status-over)]"],
    ["well under schedule", "text-[var(--status-on-track)]"],
    ["ahead of schedule", "text-[var(--status-on-track)]"],
    ["on schedule", "text-[var(--status-on-track)]"],
  ];
  let toneRender = <span>{after}</span>;
  for (const [keyword, cls] of tones) {
    if (after.includes(keyword)) {
      const [before, rest] = after.split(keyword);
      toneRender = (
        <>
          {before}
          <span className={cls}>{keyword}</span>
          {rest}
        </>
      );
      break;
    }
  }

  return (
    <>
      {parts[0]}
      <span className="text-[var(--status-on-track)]">{amountStr}</span>
      {toneRender}
    </>
  );
}

function PaceGauge({
  periodTotal,
  budgetedSpent,
  totalBudget,
  timeElapsedPercent,
}: {
  periodTotal: number;
  budgetedSpent: number;
  totalBudget: number;
  timeElapsedPercent: number;
}) {
  const size = 200;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;
  const hasBudget = totalBudget > 0;

  const fillPercent = hasBudget
    ? Math.min(100, Math.max(0, (budgetedSpent / totalBudget) * 100))
    : 0;
  const dash = (fillPercent / 100) * circumference;

  // Pace logic mirrors `pacePhrase` thresholds so gauge and phrase agree.
  // delta is in percentage points: pctSpent - timeElapsedPercent.
  const pctSpent = hasBudget ? (budgetedSpent / totalBudget) * 100 : 0;
  const delta = pctSpent - timeElapsedPercent;
  const scheduleTarget = totalBudget * (timeElapsedPercent / 100);
  const scheduleGap = budgetedSpent - scheduleTarget;
  const absScheduleGap = Math.round(Math.abs(scheduleGap));
  const overBudgetBy = Math.round(Math.max(0, budgetedSpent - totalBudget));

  const isOverBudget = pctSpent > 100;
  const isOver = isOverBudget || delta >= 25;
  const isAhead = delta <= -10;
  const ringColor = isOver ? "var(--status-over)" : "var(--status-on-track)";
  const verdictClass = isOver
    ? "text-[var(--status-over)]"
    : "text-[var(--status-on-track)]";

  let verdict: string;
  if (!hasBudget) {
    verdict = "spent this month";
  } else if (isOverBudget) {
    verdict = `₪${overBudgetBy.toLocaleString("en-IL")} over budget`;
  } else if (delta >= 25) {
    verdict = `₪${absScheduleGap.toLocaleString("en-IL")} over schedule`;
  } else if (isAhead) {
    verdict = `₪${absScheduleGap.toLocaleString("en-IL")} ahead of schedule`;
  } else {
    verdict = "On schedule";
  }

  // Notch position at the expected-by-today point on the ring.
  // SVG is rotated -90deg, so angle 0 in SVG-local coords appears at the top.
  // The stroke dash starts at angle 0 and traces clockwise (since +y is down).
  // For fraction p ∈ [0,1], the position is at angle 2π·p from SVG +x axis.
  const notchAngle = (timeElapsedPercent / 100) * 2 * Math.PI;
  const cosA = Math.cos(notchAngle);
  const sinA = Math.sin(notchAngle);
  const notchInnerR = radius - stroke / 2 - 2;
  const notchOuterR = radius + stroke / 2 + 2;
  const notchX1 = cx + notchInnerR * cosA;
  const notchY1 = cy + notchInnerR * sinA;
  const notchX2 = cx + notchOuterR * cosA;
  const notchY2 = cy + notchOuterR * sinA;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        {hasBudget && (
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
          />
        )}
        {hasBudget && (
          <line
            x1={notchX1}
            y1={notchY1}
            x2={notchX2}
            y2={notchY2}
            stroke="var(--foreground)"
            strokeOpacity={0.85}
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <div className="font-serif text-3xl tabular-nums">
          ₪{Math.round(hasBudget ? budgetedSpent : periodTotal).toLocaleString("en-IL")}
        </div>
        {hasBudget && (
          <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            of ₪{Math.round(totalBudget).toLocaleString("en-IL")}
          </div>
        )}
        <div
          className={`mt-1 text-xs ${hasBudget ? verdictClass : "text-muted-foreground"}`}
        >
          {verdict}
        </div>
      </div>
    </div>
  );
}

function StackedBar({
  legend,
}: {
  legend: { name: string; color: string; pct: number }[];
}) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {legend.map((seg, i) => (
        <div
          key={i}
          style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
        />
      ))}
    </div>
  );
}
