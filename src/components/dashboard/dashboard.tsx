"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTransactions, getSummary, getCategories } from "@/lib/api";
import { getMonthRange, formatMonthLabel, addMonths } from "@/lib/formatters";
import Link from "next/link";
import { HeroCard } from "./hero-card";
import { CategoryGrid } from "./category-grid";
import { TransactionsTable } from "./transactions-table";
import { PeriodSelector } from "./period-selector";
import { SyncButton } from "./sync-button";

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
            <Link
              href="/settings"
              aria-label="Open settings"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </Link>
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
