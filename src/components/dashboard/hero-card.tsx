"use client";

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
      <div className="rounded-3xl bg-card p-8">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const {
    overallPercentSpent,
    pacePhrase,
    periodTotal,
    daysUntilPayday,
    todayLabel,
    categoriesWithData,
  } = data;
  const percent = Math.min(100, Math.round(overallPercentSpent));

  // Top 4 categories for the stacked bar + legend, then "+X more"
  const sorted = [...categoriesWithData]
    .filter((c) => c.spent > 0)
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
            color: "#B5B3AC",
            amount: restTotal,
            pct: grandTotal > 0 ? (restTotal / grandTotal) * 100 : 0,
          },
        ]
      : []),
  ];

  const heroPhrase = renderPhrase(pacePhrase, periodTotal);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-card p-6 md:p-8 lg:p-10">
      <div className="grid gap-6 md:grid-cols-[200px_1fr] md:gap-10 lg:grid-cols-[240px_1fr]">
        <div className="flex items-center justify-center">
          <SpentDonut percent={percent} />
        </div>
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {todayLabel}
            {" · "}
            You have <span className="font-medium text-foreground">{daysUntilPayday} {daysUntilPayday === 1 ? "day" : "days"}</span>{" "}
            until payday
          </p>
          <h2 className="font-serif text-3xl leading-tight md:text-4xl lg:text-5xl">
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
        </div>
      </div>
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
    ["over your monthly target", "text-[var(--status-over)]"],
    ["over pace", "text-[var(--status-over)]"],
    ["comfortably under", "text-[var(--status-on-track)]"],
    ["within pace", "text-[var(--status-on-track)]"],
    ["on track", "text-[var(--status-on-track)]"],
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

function SpentDonut({ percent }: { percent: number }) {
  const size = 200;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-serif text-4xl">{percent}%</div>
        <div className="text-xs text-muted-foreground">spent</div>
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
