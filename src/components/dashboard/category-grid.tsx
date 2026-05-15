"use client";

import { useMemo, useState } from "react";
import { CategoryCard } from "./category-card";
import { BudgetDetailSheet } from "./budget-detail-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  BudgetStatus,
  CategoryViewMode,
  CategoryWithData,
} from "@/lib/types";

type Filter = "all" | "needs-action" | BudgetStatus;
type Sort =
  | "budgeted-first"
  | "most-spent"
  | "least-spent"
  | "alphabetical"
  | "over-pace";

interface CategoryGridProps {
  categories: CategoryWithData[];
  loading: boolean;
  periodTotal: number;
  from: string;
  to: string;
  viewMode: CategoryViewMode;
}

const FILTER_LABELS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs-action", label: "Needs action" },
  { id: "on-track", label: "On track" },
  { id: "heads-up", label: "Heads up" },
  { id: "over", label: "Over" },
  { id: "plenty-left", label: "Plenty left" },
];

function applySort(list: CategoryWithData[], sort: Sort): CategoryWithData[] {
  const copy = [...list];
  switch (sort) {
    case "budgeted-first":
      copy.sort((a, b) => {
        const aBudgeted = a.budgetMode === "budgeted" ? 1 : 0;
        const bBudgeted = b.budgetMode === "budgeted" ? 1 : 0;
        if (aBudgeted !== bBudgeted) return bBudgeted - aBudgeted;
        return b.spent - a.spent;
      });
      break;
    case "most-spent":
      copy.sort((a, b) => b.spent - a.spent);
      break;
    case "least-spent":
      copy.sort((a, b) => a.spent - b.spent);
      break;
    case "alphabetical":
      copy.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
      break;
    case "over-pace":
      copy.sort((a, b) => b.percentSpent - a.percentSpent);
      break;
  }
  return copy;
}

export function CategoryGrid({
  categories,
  loading,
  periodTotal,
  from,
  to,
  viewMode,
}: CategoryGridProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("most-spent");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Drop categories with no spending AND no explicit budget.
  const activeCategories = useMemo(
    () =>
      categories.filter(
        (c) => c.spent > 0 || (!c.isAutoBudget && c.budget > 0)
      ),
    [categories]
  );

  // In collapsed mode, the "visible" list contains parent rollups + orphan
  // leaves only (children get hidden — their parent represents them).
  // In expanded mode, the visible list contains the leaves and we render
  // section headers per parent client-side.
  const visible = useMemo(() => {
    if (viewMode === "collapsed") {
      const parentIds = new Set(
        activeCategories.filter((c) => c.isParent).map((c) => c.categoryId)
      );
      return activeCategories.filter(
        (c) => c.isParent || c.parentId == null || !parentIds.has(c.parentId)
      );
    }
    // expanded: hide synthetic parent rollup rows; show all leaves
    return activeCategories.filter((c) => !c.isParent);
  }, [activeCategories, viewMode]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: visible.length,
      "needs-action": 0,
      "on-track": 0,
      "heads-up": 0,
      over: 0,
      "plenty-left": 0,
    };
    for (const cat of visible) {
      c[cat.status]++;
      if (cat.needsReviewCount > 0) c["needs-action"]++;
    }
    return c;
  }, [visible]);

  const filtered = useMemo(() => {
    let list: CategoryWithData[];
    if (filter === "all") {
      list = visible;
    } else if (filter === "needs-action") {
      list = visible.filter((c) => c.needsReviewCount > 0);
    } else {
      list = visible.filter((c) => c.status === filter);
    }
    return applySort(list, sort);
  }, [visible, filter, sort]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (activeCategories.length === 0) {
    const hasUncategorized = periodTotal > 0;
    return (
      <div className="space-y-5">
        <h2 className="font-serif text-2xl">Budgets</h2>
        <div className="rounded-3xl border border-border bg-card p-10 md:p-14">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
            </div>
            {hasUncategorized ? (
              <>
                <h3 className="font-serif text-2xl">
                  Transactions aren&apos;t categorized yet
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  You have spending this month, but none of it is assigned to a
                  category yet. Enable an AI provider in settings and sync, or
                  assign categories manually from the transactions table below.
                </p>
              </>
            ) : (
              <>
                <h3 className="font-serif text-2xl">No spending yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  When you sync transactions and they get categorized, each
                  category will show up here with its own budget, pace, and
                  recent activity.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-2xl">Budgets</h2>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_LABELS.map((f) => {
              const active = filter === f.id;
              const count = counts[f.id];
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    active
                      ? "bg-foreground text-background shadow-sm"
                      : "bg-muted text-foreground/70 hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {f.label}
                  <span
                    className={`tabular-nums ${active ? "opacity-80" : "opacity-60"}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sort:</span>
          <Select value={sort} onValueChange={(v) => v && setSort(v as Sort)}>
            <SelectTrigger className="h-8 w-[150px] cursor-pointer border-none bg-transparent transition-colors duration-200 hover:bg-secondary hover:text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="budgeted-first">Budgeted first</SelectItem>
              <SelectItem value="most-spent">Most spent</SelectItem>
              <SelectItem value="least-spent">Least spent</SelectItem>
              <SelectItem value="over-pace">Over pace</SelectItem>
              <SelectItem value="alphabetical">Alphabetical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No categories match this filter.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CategoryCard
              key={c.categoryId}
              data={c}
              onClick={() => setSelectedId(c.categoryId)}
            />
          ))}
        </div>
      )}

      <BudgetDetailSheet
        categoryId={selectedId}
        from={from}
        to={to}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
