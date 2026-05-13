"use client";

import { useMemo, useState } from "react";
import { CategoryCard } from "./category-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BudgetStatus, CategoryWithData } from "@/lib/types";

type Filter = "all" | BudgetStatus;
type Sort = "most-spent" | "least-spent" | "alphabetical" | "over-pace";

interface CategoryGridProps {
  categories: CategoryWithData[];
  loading: boolean;
}

const FILTER_LABELS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "on-track", label: "On track" },
  { id: "heads-up", label: "Heads up" },
  { id: "over", label: "Over" },
  { id: "plenty-left", label: "Plenty left" },
];

export function CategoryGrid({ categories, loading }: CategoryGridProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("most-spent");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: categories.length,
      "on-track": 0,
      "heads-up": 0,
      over: 0,
      "plenty-left": 0,
    };
    for (const cat of categories) c[cat.status]++;
    return c;
  }, [categories]);

  const filtered = useMemo(() => {
    const list =
      filter === "all"
        ? [...categories]
        : categories.filter((c) => c.status === filter);

    switch (sort) {
      case "most-spent":
        list.sort((a, b) => b.spent - a.spent);
        break;
      case "least-spent":
        list.sort((a, b) => a.spent - b.spent);
        break;
      case "alphabetical":
        list.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
        break;
      case "over-pace":
        list.sort((a, b) => b.percentSpent - a.percentSpent);
        break;
    }
    return list;
  }, [categories, filter, sort]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-2xl">Manual categories</h2>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_LABELS.map((f) => {
              const active = filter === f.id;
              const count = counts[f.id];
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "bg-muted text-foreground/70 hover:bg-muted/70"
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
            <SelectTrigger className="h-8 w-[150px] border-none bg-transparent hover:bg-muted">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="most-spent">Most spent</SelectItem>
              <SelectItem value="least-spent">Least spent</SelectItem>
              <SelectItem value="over-pace">Over pace</SelectItem>
              <SelectItem value="alphabetical">Alphabetical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground">
          No categories match this filter.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CategoryCard key={c.categoryId} data={c} />
          ))}
        </div>
      )}
    </div>
  );
}
