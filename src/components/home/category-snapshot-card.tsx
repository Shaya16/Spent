"use client";

import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { HomeCategorySnapshotItem } from "@/lib/types";
import { CardAction, CardShell } from "./card-shell";

interface Props {
  items: HomeCategorySnapshotItem[];
}

export function CategorySnapshotCard({ items }: Props) {
  const t = useTranslations("home");
  const tCat = useTranslations("categoriesSeeded");
  if (items.length === 0) {
    return (
      <CardShell label={t("topCategoriesTitle")}>
        <div className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground">
          {t("topCategoriesEmpty")}
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      label={t("topCategoriesTitle")}
      action={<CardAction href="/budget">{t("allCategories")}</CardAction>}
    >
      <div className="flex flex-1 flex-col justify-between gap-4">
        {items.map((item) => (
          <Row
            key={item.categoryId}
            item={{ ...item, name: translateCategoryName(item.name, tCat) }}
          />
        ))}
      </div>
    </CardShell>
  );
}

function Row({ item }: { item: HomeCategorySnapshotItem }) {
  const { name, color, spent, budget, percentSpent } = item;
  const hasBudget = budget > 0;
  const isOver = percentSpent > 100;
  const fillWidth = hasBudget ? Math.min(100, percentSpent) : 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
          <span className="truncate text-sm font-medium">{name}</span>
        </div>
        <div className="shrink-0 text-end">
          <span className="tabular-nums text-sm">{formatCurrency(spent)}</span>
          {hasBudget && (
            <span className="ms-1.5 text-xs text-muted-foreground tabular-nums">
              / {formatCurrency(budget)}
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full"
          style={{
            width: `${fillWidth}%`,
            backgroundColor: isOver ? "var(--status-over)" : color,
          }}
        />
      </div>
    </div>
  );
}
