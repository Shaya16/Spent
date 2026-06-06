"use client";

import { useTranslations } from "next-intl";
import { Donut, type DonutSlice } from "@/components/charts/donut";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { BreakdownItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CardAction, CardShell } from "./card-shell";

const MAX_ROWS = 7;
const DONUT_SLICES = 6;
const OTHER_COLOR = "#B5B3AC";

export function BreakdownSection({ items }: { items: BreakdownItem[] }) {
  const t = useTranslations("home");
  const tCat = useTranslations("categoriesSeeded");

  if (items.length === 0) {
    return (
      <CardShell label={t("breakdownTitle")}>
        <div className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground">
          {t("breakdownEmpty")}
        </div>
      </CardShell>
    );
  }

  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const max = items[0]?.amount || 1;
  const rows = items.slice(0, MAX_ROWS);
  const slices: DonutSlice[] = items
    .slice(0, DONUT_SLICES)
    .map((i) => ({ value: i.amount, color: i.color }));
  const otherSum = items.slice(DONUT_SLICES).reduce((sum, i) => sum + i.amount, 0);
  if (otherSum > 0) slices.push({ value: otherSum, color: OTHER_COLOR });

  return (
    <CardShell
      label={t("breakdownTitle")}
      action={<CardAction href="/transactions">{t("allTransactions")}</CardAction>}
    >
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        <Donut slices={slices}>
          <span className="text-xs text-muted-foreground">{t("breakdownTotal")}</span>
          <span className="text-xl font-semibold tracking-tight tabular-nums">
            {formatCurrency(total)}
          </span>
        </Donut>
        <ul className="w-full flex-1 space-y-3">
          {rows.map((item) => {
            const name = translateCategoryName(item.name, tCat);
            const width = Math.max(4, (item.amount / max) * 100);
            return (
              <li key={item.categoryId} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate text-sm font-medium">{name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-sm tabular-nums">{formatCurrency(item.amount)}</span>
                    {item.deltaPercent != null && (
                      <DeltaTag percent={Math.round(item.deltaPercent)} />
                    )}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${width}%`, backgroundColor: item.color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </CardShell>
  );
}

function DeltaTag({ percent }: { percent: number }) {
  if (percent === 0) {
    return <span className="text-xs tabular-nums text-muted-foreground">0%</span>;
  }
  const up = percent > 0;
  return (
    <span className={cn("text-xs tabular-nums", up ? "text-status-over" : "text-status-on-track")}>
      {up ? "+" : "−"}
      {Math.abs(percent)}%
    </span>
  );
}
