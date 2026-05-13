"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSummary } from "@/lib/api";
import { getMonthRange, formatMonthLabel, addMonths } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/app-shell";
import { HeroCard } from "./hero-card";
import { CategoryGrid } from "./category-grid";
import { PeriodSelector } from "./period-selector";
import { SyncButton } from "./sync-button";
import { CategorizeButton } from "./categorize-button";

export function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const queryClient = useQueryClient();

  const { from, to } = getMonthRange(selectedDate);

  const summaryQuery = useQuery({
    queryKey: ["summary", from, to],
    queryFn: () => getSummary({ from, to }),
  });

  const handleSyncComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }, [queryClient]);

  const monthLabel = formatMonthLabel(selectedDate);
  const summary = summaryQuery.data;

  return (
    <>
      <PageHeader
        title="Budgets"
        meta={monthLabel}
        actions={
          <>
            <PeriodSelector
              label={monthLabel}
              onPrev={() => setSelectedDate((d) => addMonths(d, -1))}
              onNext={() => setSelectedDate((d) => addMonths(d, 1))}
            />
            <CategorizeButton onApplied={handleSyncComplete} />
            <SyncButton onComplete={handleSyncComplete} />
          </>
        }
      />

      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <HeroCard data={summary} loading={summaryQuery.isLoading} />
        <CategoryGrid
          categories={summary?.categoriesWithData ?? []}
          loading={summaryQuery.isLoading}
          periodTotal={summary?.periodTotal ?? 0}
          from={from}
          to={to}
        />
      </div>
    </>
  );
}
