"use client";

import { CardShell } from "./card-shell";
import { formatCurrency } from "@/lib/formatters";
import type { HomeTopMerchant } from "@/lib/types";

interface Props {
  items: HomeTopMerchant[];
}

export function TopMerchantsCard({ items }: Props) {
  if (items.length === 0) {
    return (
      <CardShell label="Top merchants">
        <div className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground">
          No spending this month yet.
        </div>
      </CardShell>
    );
  }

  const max = items[0]?.total ?? 0;

  return (
    <CardShell label="Top merchants this month">
      <ul className="flex flex-1 flex-col gap-3">
        {items.map((m, i) => {
          const widthPct = max > 0 ? (m.total / max) * 100 : 0;
          return (
            <li key={`${m.name}-${i}`} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">{m.name}</span>
                <span className="shrink-0 tabular-nums text-sm">
                  {formatCurrency(m.total)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-foreground/70"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {m.count} {m.count === 1 ? "txn" : "txns"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}
