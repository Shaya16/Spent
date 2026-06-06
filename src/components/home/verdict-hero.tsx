"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { BurndownChart } from "@/components/charts/burndown-chart";
import type { Locale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/formatters";
import type { BurndownPayload, HomeCashFlow, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  verdict: Verdict;
  cashFlow: HomeCashFlow | null;
  burndown: BurndownPayload | null;
}

export function VerdictHero({ verdict, cashFlow, burndown }: Props) {
  const t = useTranslations("home");
  const locale = useLocale() as Locale;
  const monthName = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-IL", {
    month: "long",
  }).format(new Date());

  const deltaRounded = verdict.deltaPercent == null ? null : Math.round(verdict.deltaPercent);
  const hasBurndown = burndown != null && burndown.current.length > 1;
  const hasPace = verdict.typicalMonthly != null && verdict.vsTypicalPercent != null;

  const paceMeta = {
    over: { label: t("paceOver"), cls: "text-status-over" },
    under: { label: t("paceUnder"), cls: "text-status-on-track" },
    "on-track": { label: t("paceOnTrack"), cls: "text-muted-foreground" },
  } as const;

  let subtitle: string | null = null;
  if (hasPace) {
    subtitle =
      verdict.projectedStatus === "over"
        ? t("heroPaceOverLong")
        : verdict.projectedStatus === "under"
          ? t("heroPaceUnderLong")
          : t("heroPaceOnTrackLong");
  }

  const net = cashFlow?.net ?? 0;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-3 p-5 pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t("heroSpentLabel", { month: monthName })}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <span className="text-xs text-muted-foreground">
          {t("daysToPayday", { days: verdict.daysUntilPayday })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-border bg-border md:grid-cols-4">
        <Kpi
          label={t("chipExpenses")}
          value={formatCurrency(verdict.spent)}
          meta={<DeltaText t={t} percent={deltaRounded} />}
        />
        <Kpi
          label={t("kpiProjected")}
          value={formatCurrency(verdict.projected)}
          meta={
            hasPace ? (
              <span className={cn("text-xs font-medium", paceMeta[verdict.projectedStatus].cls)}>
                {paceMeta[verdict.projectedStatus].label}
              </span>
            ) : null
          }
        />
        <Kpi label={t("chipIncome")} value={formatCurrency(cashFlow?.income ?? 0)} />
        <Kpi
          label={t("chipNet")}
          value={`${net > 0 ? "+" : ""}${formatCurrency(net)}`}
          valueClass={net >= 0 ? "text-status-on-track" : "text-status-over"}
        />
      </div>

      <div className="border-t border-border p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold tracking-tight">{t("burndownTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("burndownSubtitle")}</p>
        </div>
        {hasBurndown ? (
          <BurndownChart
            current={burndown.current}
            prior={burndown.prior}
            totalDays={burndown.totalDays}
            labels={{ thisMonth: t("burndownThisMonth"), lastMonth: t("burndownLastMonth") }}
          />
        ) : (
          <div className="flex items-center justify-center rounded-lg bg-muted/40 py-8 text-center text-sm text-muted-foreground">
            {t("burndownEmpty")}
          </div>
        )}
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  meta,
  valueClass,
}: {
  label: string;
  value: string;
  meta?: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {meta}
      </div>
      <span className={cn("text-2xl font-semibold tracking-tight tabular-nums", valueClass)}>
        {value}
      </span>
    </div>
  );
}

function DeltaText({
  t,
  percent,
}: {
  t: ReturnType<typeof useTranslations<"home">>;
  percent: number | null;
}) {
  if (percent == null) {
    return <span className="text-xs text-muted-foreground">{t("heroNoComparison")}</span>;
  }
  const up = percent > 0;
  const flat = percent === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const cls = flat ? "text-muted-foreground" : up ? "text-status-over" : "text-status-on-track";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", cls)}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(percent)}%
    </span>
  );
}
