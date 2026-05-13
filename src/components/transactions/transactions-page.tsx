"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/app-shell";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { KpiCards } from "./kpi-cards";
import { WidgetsRow } from "./widgets-row";
import {
  getCategories,
  getTransactions,
  getTransactionsSummary,
} from "@/lib/api";
import type { TransactionKindFilter } from "@/lib/api";
import {
  addMonths,
  formatMonthLabel,
  getMonthRange,
} from "@/lib/formatters";

const FILTER_OPTIONS: { value: TransactionKindFilter; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expenses" },
];

export function TransactionsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>();
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<TransactionKindFilter>("all");

  const { from, to } = getMonthRange(selectedDate);

  const transactionsQuery = useQuery({
    queryKey: ["transactions", from, to, search, categoryFilter, page, kind],
    queryFn: () =>
      getTransactions({
        from,
        to,
        search: search || undefined,
        category: categoryFilter,
        limit: 50,
        offset: page * 50,
        kind,
      }),
  });

  const summaryQuery = useQuery({
    queryKey: ["transactions-summary", from, to],
    queryFn: () => getTransactionsSummary({ from, to }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", kind === "income" ? "income" : "expense"],
    queryFn: () =>
      kind === "income" ? getCategories("income") : getCategories("expense"),
  });

  return (
    <>
      <PageHeader
        title="Transactions"
        meta={formatMonthLabel(selectedDate)}
        actions={
          <PeriodSelector
            label={formatMonthLabel(selectedDate)}
            onPrev={() => setSelectedDate((d) => addMonths(d, -1))}
            onNext={() => setSelectedDate((d) => addMonths(d, 1))}
          />
        }
      />

      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <KpiCards summary={summaryQuery.data} loading={summaryQuery.isLoading} />

        <WidgetsRow
          summary={summaryQuery.data}
          loading={summaryQuery.isLoading}
        />

        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card p-1 w-fit">
          {FILTER_OPTIONS.map((opt) => {
            const active = kind === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setKind(opt.value);
                  setPage(0);
                  setCategoryFilter(undefined);
                }}
                className={
                  active
                    ? "rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-colors"
                    : "rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <TransactionsTable
          transactions={transactionsQuery.data?.transactions ?? []}
          total={transactionsQuery.data?.total ?? 0}
          categories={categoriesQuery.data ?? []}
          loading={transactionsQuery.isLoading}
          search={search}
          onSearchChange={setSearch}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          page={page}
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
