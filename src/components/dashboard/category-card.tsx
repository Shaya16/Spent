"use client";

import { HelpCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getCategoryIcon } from "@/components/category-icon";
import type { Locale } from "@/i18n/routing";
import { shade, tint } from "@/lib/colors";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { BudgetStatus, CategoryWithData } from "@/lib/types";

interface CategoryCardProps {
  data: CategoryWithData;
  onClick?: () => void;
}

export function CategoryCard({ data, onClick }: CategoryCardProps) {
  const t = useTranslations("dashboard");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale() as Locale;
  const Icon = getCategoryIcon(data.categoryIcon);
  const percent = Math.min(999, Math.round(data.percentSpent));
  const vsLast = data.vsLastMonth;
  const isTracking = data.budgetMode === "tracking";
  const categoryName = translateCategoryName(data.categoryName, tCat);
  const parentName = data.parentName ? translateCategoryName(data.parentName, tCat) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full cursor-pointer rounded-2xl border border-border bg-card p-5 text-start transition-colors duration-200 ease-out hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: tint(data.categoryColor, 0.18) }}
          >
            <Icon className="h-5 w-5" style={{ color: shade(data.categoryColor) }} />
          </div>
          <div className="min-w-0 flex-1">
            {parentName && (
              <div
                className="text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ color: shade(data.categoryColor) }}
              >
                {parentName}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="font-medium leading-tight">{categoryName}</span>
              {data.isParent && data.childCount != null && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                  style={{
                    background: tint(data.categoryColor, 0.22),
                    color: shade(data.categoryColor),
                  }}
                  title={t("subcategoriesTooltip", { count: data.childCount })}
                >
                  {data.childCount}
                </span>
              )}
              {data.needsReviewCount > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                  style={{
                    backgroundColor: "color-mix(in oklch, var(--status-heads-up) 18%, transparent)",
                    color: "var(--status-heads-up)",
                  }}
                  title={t("needsReviewTooltip", { count: data.needsReviewCount })}
                >
                  <HelpCircle className="h-3 w-3" />
                  {data.needsReviewCount}
                </span>
              )}
              {data.isParent && data.budgetSource === "own" && !isTracking && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("ownBudgetTag")}
                </span>
              )}
              {data.isParent && data.budgetSource === "rollup" && !isTracking && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("rolledUpTag")}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {data.transactionCount}{" "}
              {data.transactionCount === 1 ? t("transactionsOne") : t("transactionsOther")}
              {data.topMerchant ? ` · ${t("mostlyMerchant", { merchant: data.topMerchant })}` : ""}
            </div>
          </div>
        </div>
        {!isTracking && (
          <ProgressDonut percent={percent} color={data.categoryColor} status={data.status} />
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-1.5">
          <span className="font-serif text-3xl tabular-nums">
            {formatCurrency(data.spent, "ILS", locale)}
          </span>
          {!isTracking && data.budget > 0 && (
            <span className="font-serif text-base tabular-nums text-muted-foreground">
              / {formatCurrency(data.budget, "ILS", locale)}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {isTracking ? (
            <VsTypical vsTypical={data.vsTypical} color={data.categoryColor} />
          ) : (
            <>
              {data.budget === 0 && <span>{t("noBudgetSet")}</span>}
              {vsLast != null && <VsLastMonth pct={vsLast} />}
            </>
          )}
        </div>
      </div>

      {!isTracking && (
        <div className="mt-4 flex items-center justify-between gap-2 text-xs">
          <div className="text-muted-foreground tabular-nums">
            {data.budget > 0 ? (
              data.spent <= data.budget ? (
                <>
                  {t("spentLeft", {
                    amount: formatCurrency(data.remaining, "ILS", locale),
                  })}
                  {data.perDayRemaining != null && (
                    <>
                      {" · "}
                      {t("perDay", {
                        amount: formatCurrency(data.perDayRemaining, "ILS", locale),
                      })}
                    </>
                  )}
                </>
              ) : (
                <>
                  <span className="text-status-over">
                    {t("overAmount", {
                      amount: formatCurrency(data.spent - data.budget, "ILS", locale),
                    })}
                  </span>
                  {t("overByEaseUp")}
                </>
              )
            ) : (
              <span>{t("setBudgetToTrack")}</span>
            )}
          </div>
          <StatusPill status={data.status} />
        </div>
      )}
    </button>
  );
}

function VsTypical({
  vsTypical,
  color,
}: {
  vsTypical: { typical: number; percentDiff: number } | null;
  color: string;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale() as Locale;
  if (!vsTypical || vsTypical.typical <= 0) {
    return null;
  }
  const rounded = Math.round(vsTypical.percentDiff);
  const arrow = Math.abs(rounded) < 5 ? "≈" : rounded > 0 ? "↑" : "↓";
  const accent = shade(color);
  return (
    <span className="flex items-center gap-1 tabular-nums">
      <span style={{ color: accent }}>{arrow}</span>
      {Math.abs(rounded) >= 5 && <span>{Math.abs(rounded)}%</span>}
      <span>{t("vsTypical", { amount: formatCurrency(vsTypical.typical, "ILS", locale) })}</span>
    </span>
  );
}

function ProgressDonut({
  percent,
  color,
  status,
}: {
  percent: number;
  color: string;
  status: BudgetStatus;
}) {
  const size = 52;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const visualPercent = Math.min(100, percent);
  const dash = (visualPercent / 100) * circumference;
  const strokeColor = status === "over" ? "var(--status-over)" : shade(color);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tint(color, 0.18)}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-medium tabular-nums">
        {percent}%
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: BudgetStatus }) {
  const t = useTranslations("dashboard");
  const meta: Record<BudgetStatus, { label: string; color: string }> = {
    "plenty-left": { label: t("statusPlentyLeft"), color: "var(--status-plenty-left)" },
    "on-track": { label: t("statusOnTrack"), color: "var(--status-on-track)" },
    "heads-up": { label: t("statusHeadsUp"), color: "var(--status-heads-up)" },
    over: { label: t("statusOver"), color: "var(--status-over)" },
  };
  const m = meta[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums"
      style={{
        backgroundColor: `color-mix(in oklch, ${m.color} 18%, transparent)`,
        color: m.color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
    </span>
  );
}

function VsLastMonth({ pct }: { pct: number }) {
  const t = useTranslations("dashboard");
  const rounded = Math.round(pct);
  if (Math.abs(rounded) < 1) {
    return <span className="text-muted-foreground">{t("vsLastMonthFlat")}</span>;
  }
  const up = rounded > 0;
  return (
    <span className={up ? "text-status-over" : "text-status-on-track"}>
      {up
        ? t("vsLastMonthUp", { pct: Math.abs(rounded) })
        : t("vsLastMonthDown", { pct: Math.abs(rounded) })}
    </span>
  );
}
