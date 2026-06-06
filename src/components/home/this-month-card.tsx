"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Link } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/formatters";
import type { HomeThisMonth } from "@/lib/types";
import { CardAction, CardShell } from "./card-shell";

interface Props {
  data: HomeThisMonth;
}

export function ThisMonthCard({ data }: Props) {
  const t = useTranslations("home");
  const { spent, budget, deltaVsLastMonth, daysUntilPayday, timeElapsedPercent, monthLabel } = data;
  const hasBudget = budget > 0;
  const percentSpent = hasBudget ? Math.min(100, (spent / budget) * 100) : 0;
  const pctSpent = hasBudget ? (spent / budget) * 100 : 0;
  const delta = pctSpent - timeElapsedPercent;
  const isOver = pctSpent > 100;
  const isHeadsUp = !isOver && delta >= 20;
  const isAhead = !isOver && delta <= -10;

  let verdict = t("spentThisMonth");
  let verdictClass = "text-muted-foreground";
  if (hasBudget) {
    if (isOver) {
      verdict = t("verdictOver", { amount: formatCurrency(spent - budget) });
      verdictClass = "text-status-over";
    } else if (isHeadsUp) {
      verdict = t("verdictABitOver");
      verdictClass = "text-status-over";
    } else if (isAhead) {
      verdict = t("verdictAhead");
      verdictClass = "text-status-on-track";
    } else {
      verdict = t("verdictOnSchedule");
      verdictClass = "text-status-on-track";
    }
  }

  return (
    <CardShell
      label={t("thisMonthLabel", { month: monthLabel })}
      action={<CardAction href="/budget">{t("budgetDetail")}</CardAction>}
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
          {deltaVsLastMonth != null && <DeltaPill value={deltaVsLastMonth} />}
        </div>

        {hasBudget && (
          <div className="space-y-2">
            <ProgressBar
              percent={percentSpent}
              markPercent={timeElapsedPercent}
              tone={isOver ? "over" : "on-track"}
            />
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>
                {t("percentOfBudget", {
                  percent: Math.round(pctSpent),
                  budget: formatCurrency(budget),
                })}
              </span>
              <span>{t("daysToPayday", { days: daysUntilPayday })}</span>
            </div>
          </div>
        )}

        {!hasBudget && (
          <div className="text-xs text-muted-foreground">
            {t("daysToPayday", { days: daysUntilPayday })}
          </div>
        )}
      </Link>
    </CardShell>
  );
}

function DeltaPill({ value }: { value: number }) {
  const t = useTranslations("home");
  const rounded = Math.round(value);
  const isUp = rounded > 0;
  const isFlat = rounded === 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  const cls = isFlat
    ? "text-muted-foreground bg-muted/60"
    : isUp
      ? "text-status-over bg-status-over/10"
      : "text-status-on-track bg-status-on-track/10";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${cls}`}
      title={t("comparedToLastMonth")}
    >
      {!isFlat && <Icon className="h-3 w-3" />}
      {t("vsLastMonth", { percent: Math.abs(rounded) })}
    </span>
  );
}
