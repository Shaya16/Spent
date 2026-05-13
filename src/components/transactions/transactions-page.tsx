"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/app-shell";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { getCategories, getTransactions } from "@/lib/api";
import {
  addMonths,
  formatCurrency,
  formatMonthLabel,
  getMonthRange,
} from "@/lib/formatters";

export function TransactionsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>();
  const [page, setPage] = useState(0);

  const { from, to } = getMonthRange(selectedDate);

  const transactionsQuery = useQuery({
    queryKey: ["transactions", from, to, search, categoryFilter, page],
    queryFn: () =>
      getTransactions({
        from,
        to,
        search: search || undefined,
        category: categoryFilter,
        limit: 50,
        offset: page * 50,
      }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  const totalSpend =
    transactionsQuery.data?.transactions
      .filter((t) => t.chargedAmount < 0)
      .reduce((s, t) => s + Math.abs(t.chargedAmount), 0) ?? 0;

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

      <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
        <div className="rounded-2xl bg-card p-5">
          <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Spend this period
          </div>
          <div className="mt-1 font-serif text-3xl tabular-nums">
            {formatCurrency(totalSpend)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {transactionsQuery.data?.total ?? 0} transactions
          </div>
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
