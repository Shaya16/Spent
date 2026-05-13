"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTransactions, getSummary, getCategories } from "@/lib/api";
import { getMonthRange, formatMonthLabel, addMonths } from "@/lib/formatters";
import { HeroCard } from "./hero-card";
import { CategoryGrid } from "./category-grid";
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
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
          <div className="flex items-baseline gap-3">
            <h1 className="font-serif text-2xl">Budgets</h1>
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{monthLabel}</span>
          </div>
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

      <main className="mx-auto max-w-7xl space-y-8 p-4 pt-6 md:px-6 md:pt-10">
        <HeroCard data={summary} loading={summaryQuery.isLoading} />

        <CategoryGrid
          categories={summary?.categoriesWithData ?? []}
          loading={summaryQuery.isLoading}
          periodTotal={summary?.periodTotal ?? 0}
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
