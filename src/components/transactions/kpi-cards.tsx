"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { TransactionsSummary } from "@/lib/api";

interface KpiCardsProps {
  summary?: TransactionsSummary;
  loading: boolean;
}

const INCOME_TINT = "color-mix(in oklch, var(--status-on-track) 12%, transparent)";
const EXPENSE_TINT = "color-mix(in oklch, var(--status-over) 12%, transparent)";

export function KpiCards({ summary, loading }: KpiCardsProps) {
  const income = summary?.income.total ?? 0;
  const expense = summary?.expense.total ?? 0;
  const net = summary?.net ?? 0;
  const incomeCount = summary?.income.count ?? 0;
  const expenseCount = summary?.expense.count ?? 0;
  const netPositive = net >= 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        label="Income"
        amount={income}
        meta={`${incomeCount} ${incomeCount === 1 ? "transaction" : "transactions"}`}
        icon={<ArrowUpRight className="h-4 w-4" />}
        color="var(--status-on-track)"
        iconBg={INCOME_TINT}
        loading={loading}
      />
      <KpiCard
        label="Expenses"
        amount={expense}
        meta={`${expenseCount} ${expenseCount === 1 ? "transaction" : "transactions"}`}
        icon={<ArrowDownRight className="h-4 w-4" />}
        color="var(--status-over)"
        iconBg={EXPENSE_TINT}
        loading={loading}
      />
      <KpiCard
        label={netPositive ? "Net saved" : "Net overspend"}
        amount={Math.abs(net)}
        meta={netPositive ? "Income exceeded expenses" : "Expenses exceeded income"}
        icon={
          net === 0 ? (
            <Minus className="h-4 w-4" />
          ) : netPositive ? (
            <ArrowUpRight className="h-4 w-4" />
          ) : (
            <ArrowDownRight className="h-4 w-4" />
          )
        }
        color={
          net === 0
            ? "var(--muted-foreground)"
            : netPositive
              ? "var(--status-on-track)"
              : "var(--status-over)"
        }
        iconBg={
          net === 0
            ? "color-mix(in oklch, var(--muted-foreground) 12%, transparent)"
            : netPositive
              ? INCOME_TINT
              : EXPENSE_TINT
        }
        loading={loading}
      />
    </div>
  );
}

interface KpiCardProps {
  label: string;
  amount: number;
  meta: string;
  icon: React.ReactNode;
  color: string;
  iconBg: string;
  loading: boolean;
}

function KpiCard({
  label,
  amount,
  meta,
  icon,
  color,
  iconBg,
  loading,
}: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </div>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: iconBg, color }}
        >
          {icon}
        </div>
      </div>
      <div
        className="mt-2 font-serif text-3xl tabular-nums"
        style={{ color }}
      >
        {loading ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatCurrency(amount)
        )}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div>
    </div>
  );
}
