"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSummary } from "@/lib/api";
import { getMonthRange, formatMonthLabel, addMonths } from "@/lib/formatters";
import { PageHeader } from "@/components/layout/app-shell";
import { HeroCard } from "./hero-card";
import { CategoryGrid } from "./category-grid";
import { PeriodSelector } from "./period-selector";
import { SyncButton } from "./sync-button";
import { CategorizeButton } from "./categorize-button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CategoryViewMode } from "@/lib/types";

const VIEW_MODE_KEY = "spent.dashboard.viewMode";

function readViewMode(): CategoryViewMode {
  if (typeof window === "undefined") return "collapsed";
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_KEY);
    return raw === "expanded" ? "expanded" : "collapsed";
  } catch {
    return "collapsed";
  }
}

export function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<CategoryViewMode>("collapsed");
  const queryClient = useQueryClient();

  // Hydrate the persisted view mode after mount to avoid SSR mismatch.
  useEffect(() => {
    setViewMode(readViewMode());
  }, []);

  const handleViewModeChange = useCallback((mode: CategoryViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // Storage may be unavailable; in-memory state still works.
    }
  }, []);

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

        <div className="flex items-center justify-end">
          <Tabs
            value={viewMode}
            onValueChange={(v) =>
              handleViewModeChange(v === "expanded" ? "expanded" : "collapsed")
            }
          >
            <TabsList>
              <TabsTrigger value="collapsed">Grouped</TabsTrigger>
              <TabsTrigger value="expanded">All categories</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <CategoryGrid
          categories={summary?.categoriesWithData ?? []}
          loading={summaryQuery.isLoading}
          periodTotal={summary?.periodTotal ?? 0}
          from={from}
          to={to}
          viewMode={viewMode}
        />
      </div>
    </>
  );
}
