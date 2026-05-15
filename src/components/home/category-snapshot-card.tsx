"use client";

import { CardShell, CardAction } from "./card-shell";
import { formatCurrency } from "@/lib/formatters";
import type { HomeCategorySnapshotItem } from "@/lib/types";

interface Props {
  items: HomeCategorySnapshotItem[];
}

export function CategorySnapshotCard({ items }: Props) {
  if (items.length === 0) {
    return (
      <CardShell label="Top categories">
        <div className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground">
          No category spend yet this month.
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      label="Top categories"
      action={<CardAction href="/budget">All categories →</CardAction>}
    >
      <div className="flex flex-1 flex-col justify-between gap-4">
        {items.map((item) => (
          <Row key={item.categoryId} item={item} />
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
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: color }}
          />
          <span className="truncate text-sm font-medium">{name}</span>
        </div>
        <div className="shrink-0 text-right">
          <span className="tabular-nums text-sm">{formatCurrency(spent)}</span>
          {hasBudget && (
            <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
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
