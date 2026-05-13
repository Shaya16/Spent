"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTransactions, getSummary, getCategories } from "@/lib/api";
import { getMonthRange, formatMonthLabel, addMonths } from "@/lib/formatters";
import { SummaryCards } from "./summary-cards";
import { MonthlySpendChart } from "@/components/charts/monthly-spend-chart";
import { CategoryDonutChart } from "@/components/charts/category-donut-chart";
import { TopMerchantsChart } from "@/components/charts/top-merchants-chart";
import { TransactionsTable } from "./transactions-table";
import { PeriodSelector } from "./period-selector";
import { SyncButton } from "./sync-button";
import { SettingsDrawer } from "./settings-drawer";

export function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>();
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();

  const { from, to } = getMonthRange(selectedDate);

  const summaryQuery = useQuery({
    queryKey: ["summary", from, to],
    queryFn: () => getSummary({ from, to }),
  });

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

  const handlePrev = () => setSelectedDate((d) => addMonths(d, -1));
  const handleNext = () => setSelectedDate((d) => addMonths(d, 1));

  const handleSyncComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }, [queryClient]);

  const monthLabel = formatMonthLabel(selectedDate);
  const summary = summaryQuery.data;
  const transactions = transactionsQuery.data;
  const categories = categoriesQuery.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <h1 className="text-lg font-semibold tracking-tight">Spent</h1>
          <div className="flex items-center gap-3">
            <PeriodSelector
              label={monthLabel}
              onPrev={handlePrev}
              onNext={handleNext}
            />
            <SyncButton onComplete={handleSyncComplete} />
            <SettingsDrawer />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-4 pt-6">
        <SummaryCards
          total={summary?.periodTotal ?? 0}
          count={summary?.transactionCount ?? 0}
          topCategory={summary?.categoryBreakdown[0]}
          loading={summaryQuery.isLoading}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <MonthlySpendChart
            data={summary?.monthlySpend ?? []}
            loading={summaryQuery.isLoading}
          />
          <CategoryDonutChart
            data={summary?.categoryBreakdown ?? []}
            loading={summaryQuery.isLoading}
          />
        </div>

        <TopMerchantsChart
          data={summary?.topMerchants ?? []}
          loading={summaryQuery.isLoading}
        />

        <TransactionsTable
          transactions={transactions?.transactions ?? []}
          total={transactions?.total ?? 0}
          categories={categories}
          loading={transactionsQuery.isLoading}
          search={search}
          onSearchChange={setSearch}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          page={page}
          onPageChange={setPage}
        />
      </main>
    </div>
  );
}
