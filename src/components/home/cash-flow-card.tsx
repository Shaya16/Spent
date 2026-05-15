"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { CardShell } from "./card-shell";
import { formatCurrency } from "@/lib/formatters";
import type { HomeCashFlow } from "@/lib/types";

interface Props {
  data: HomeCashFlow;
}

export function CashFlowCard({ data }: Props) {
  const { income, expenses, net } = data;
  const netPositive = net >= 0;

  return (
    <CardShell label="Cash flow">
      <div className="flex flex-1 flex-col justify-between gap-5">
        <div className="space-y-3">
          <Row
            label="In"
            value={formatCurrency(income)}
            icon={<ArrowDownRight className="h-3.5 w-3.5 text-[var(--status-on-track)]" />}
            valueClass="text-[var(--status-on-track)]"
          />
          <Row
            label="Out"
            value={formatCurrency(expenses)}
            icon={<ArrowUpRight className="h-3.5 w-3.5 text-[var(--status-over)]" />}
            valueClass="text-foreground"
          />
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Net
            </span>
            <span
              className={`font-serif text-2xl tabular-nums ${
                netPositive
                  ? "text-[var(--status-on-track)]"
                  : "text-[var(--status-over)]"
              }`}
            >
              {netPositive ? "+" : "−"}
              {formatCurrency(Math.abs(net))}
            </span>
          </div>
        </div>
      </div>
    </CardShell>
  );
}

function Row({
  label,
  value,
  icon,
  valueClass,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClass: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={`tabular-nums text-lg ${valueClass}`}>{value}</span>
    </div>
  );
}
