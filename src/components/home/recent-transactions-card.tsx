"use client";

import Link from "next/link";
import { CardShell, CardAction } from "./card-shell";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { HomeRecentTransaction } from "@/lib/types";

interface Props {
  items: HomeRecentTransaction[];
}

export function RecentTransactionsCard({ items }: Props) {
  if (items.length === 0) {
    return (
      <CardShell label="Recent activity">
        <div className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground">
          No transactions yet. Sync your bank to see activity here.
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      label="Recent activity"
      action={<CardAction href="/transactions">All transactions →</CardAction>}
    >
      <ul className="-mx-2 divide-y divide-border/60">
        {items.map((txn) => (
          <li key={txn.id}>
            <Link
              href="/transactions"
              className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatDayMonth(txn.date)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {txn.description}
                  </div>
                  {txn.categoryName ? (
                    <CategoryBadge
                      name={txn.categoryName}
                      color={txn.categoryColor}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Uncategorized
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`shrink-0 text-sm tabular-nums ${
                  txn.kind === "income"
                    ? "text-[var(--status-on-track)]"
                    : "text-foreground"
                }`}
              >
                {txn.kind === "income" ? "+" : "−"}
                {formatCurrency(txn.chargedAmount)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function CategoryBadge({
  name,
  color,
}: {
  name: string;
  color: string | null;
}) {
  return (
    <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {color && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

function formatDayMonth(iso: string): string {
  const formatted = formatDate(iso); // DD/MM/YYYY
  const parts = formatted.split("/");
  return `${parts[0]}/${parts[1]}`;
}
