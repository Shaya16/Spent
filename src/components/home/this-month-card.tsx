"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { CardShell, CardAction } from "./card-shell";
import { formatCurrency } from "@/lib/formatters";
import type { HomeThisMonth } from "@/lib/types";

interface Props {
  data: HomeThisMonth;
}

export function ThisMonthCard({ data }: Props) {
  const {
    spent,
    budget,
    deltaVsLastMonth,
    daysUntilPayday,
    timeElapsedPercent,
    monthLabel,
  } = data;
  const hasBudget = budget > 0;
  const percentSpent = hasBudget ? Math.min(100, (spent / budget) * 100) : 0;
  const pctSpent = hasBudget ? (spent / budget) * 100 : 0;
  const delta = pctSpent - timeElapsedPercent;
  const isOver = pctSpent > 100;
  const isHeadsUp = !isOver && delta >= 20;
  const isAhead = !isOver && delta <= -10;

  let verdict = "Spent this month";
  let verdictClass = "text-muted-foreground";
  if (hasBudget) {
    if (isOver) {
      verdict = `${formatCurrency(spent - budget)} over budget`;
      verdictClass = "text-[var(--status-over)]";
    } else if (isHeadsUp) {
      verdict = "A bit over schedule";
      verdictClass = "text-[var(--status-over)]";
    } else if (isAhead) {
      verdict = "Ahead of schedule";
      verdictClass = "text-[var(--status-on-track)]";
    } else {
      verdict = "On schedule";
      verdictClass = "text-[var(--status-on-track)]";
    }
  }

  return (
    <CardShell
      label={`This ${monthLabel}`}
      action={<CardAction href="/budget">Budget detail →</CardAction>}
    >
      <Link
        href="/budget"
        className="group -m-2 flex flex-1 flex-col gap-5 rounded-2xl p-2 outline-none transition-colors hover:bg-accent/30 focus-visible:bg-accent/40"
      >
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div className="flex flex-col">
            <span className="font-serif text-4xl leading-none tracking-tight md:text-5xl">
              {formatCurrency(spent)}
            </span>
            <span className={`mt-2 text-sm ${verdictClass}`}>{verdict}</span>
          </div>
          {deltaVsLastMonth != null && (
            <DeltaPill value={deltaVsLastMonth} />
          )}
        </div>

        {hasBudget && (
          <div className="space-y-2">
            <ProgressBar
              percent={percentSpent}
              markPercent={timeElapsedPercent}
              isOver={isOver}
            />
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>
                {Math.round(pctSpent)}% of {formatCurrency(budget)}
              </span>
              <span>
                {daysUntilPayday} {daysUntilPayday === 1 ? "day" : "days"} to payday
              </span>
            </div>
          </div>
        )}

        {!hasBudget && (
          <div className="text-xs text-muted-foreground">
            {daysUntilPayday} {daysUntilPayday === 1 ? "day" : "days"} to payday
          </div>
        )}
      </Link>
    </CardShell>
  );
}

function DeltaPill({ value }: { value: number }) {
  const rounded = Math.round(value);
  const isUp = rounded > 0;
  const isFlat = rounded === 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  const cls = isFlat
    ? "text-muted-foreground bg-muted/60"
    : isUp
      ? "text-[var(--status-over)] bg-[var(--status-over)]/10"
      : "text-[var(--status-on-track)] bg-[var(--status-on-track)]/10";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${cls}`}
      title="Compared to the same window last month"
    >
      {!isFlat && <Icon className="h-3 w-3" />}
      {Math.abs(rounded)}% vs. last month
    </span>
  );
}

function ProgressBar({
  percent,
  markPercent,
  isOver,
}: {
  percent: number;
  markPercent: number;
  isOver: boolean;
}) {
  const fillClass = isOver
    ? "bg-[var(--status-over)]"
    : "bg-[var(--status-on-track)]";
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full ${fillClass}`}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
      <div
        className="absolute top-0 bottom-0 w-px bg-foreground/40"
        style={{ left: `${Math.min(100, Math.max(0, markPercent))}%` }}
        aria-hidden
      />
    </div>
  );
}
