"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSummary, updateBudget } from "@/lib/api";
import { getMonthRange } from "@/lib/formatters";
import { SectionShell, SettingCard } from "./section-shell";
import type { CategoryWithData } from "@/lib/types";

export function BudgetsSection() {
  const { from, to } = getMonthRange();
  const { data: summary } = useQuery({
    queryKey: ["summary", from, to],
    queryFn: () => getSummary({ from, to }),
  });

  if (!summary) {
    return (
      <SectionShell title="Budgets">
        <SettingCard>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </SettingCard>
      </SectionShell>
    );
  }

  const categories = [...summary.categoriesWithData].sort(
    (a, b) => b.spent - a.spent
  );
  const auto = categories.filter((c) => c.isAutoBudget);
  const explicit = categories.filter((c) => !c.isAutoBudget);

  return (
    <SectionShell
      title="Budgets"
      description='Monthly limit per category. New categories default to last month’s actual spend (marked "auto"). Override here to lock in a target.'
    >
      {explicit.length > 0 && (
        <SettingCard title="Your budgets">
          <BudgetList categories={explicit} />
        </SettingCard>
      )}

      <SettingCard
        title="Auto-set from last month"
        description="These start at last month's spend. Click the number to override."
      >
        <BudgetList categories={auto} />
      </SettingCard>
    </SectionShell>
  );
}

function BudgetList({ categories }: { categories: CategoryWithData[] }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({
      categoryId,
      amount,
    }: {
      categoryId: number;
      amount: number | null;
    }) => updateBudget(categoryId, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  if (categories.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">No categories yet.</div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {categories.map((cat) => (
        <BudgetRow
          key={cat.categoryId}
          category={cat}
          onChange={(amount) =>
            mutation.mutate({ categoryId: cat.categoryId, amount })
          }
          onReset={() =>
            mutation.mutate({ categoryId: cat.categoryId, amount: null })
          }
        />
      ))}
    </div>
  );
}

function BudgetRow({
  category,
  onChange,
  onReset,
}: {
  category: CategoryWithData;
  onChange: (amount: number | null) => void;
  onReset: () => void;
}) {
  const [value, setValue] = useState(String(Math.round(category.budget)));

  const handleBlur = () => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (Math.round(parsed) === Math.round(category.budget)) return;
    onChange(parsed);
  };

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: category.categoryColor }}
        />
        <span className="truncate text-sm font-medium">
          {category.categoryName}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          ₪{Math.round(category.spent).toLocaleString("en-IL")} spent
        </span>
      </div>
      <div className="flex items-center gap-2">
        {!category.isAutoBudget && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={onReset}
          >
            Reset to auto
          </Button>
        )}
        <span className="text-xs text-muted-foreground">₪</span>
        <Input
          type="number"
          className="h-9 w-28 text-right tabular-nums"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          min={0}
        />
      </div>
    </div>
  );
}
