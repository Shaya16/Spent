"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { getCategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Locale } from "@/i18n/routing";
import { getCategories, setBudgetModesBulk, updateBudget } from "@/lib/api";
import { shade, tint } from "@/lib/colors";
import { formatCurrency } from "@/lib/formatters";
import type { Category } from "@/lib/types";

interface BudgetsStepProps {
  onComplete: () => void;
  onBack: () => void;
}

export function BudgetsStep({ onComplete, onBack }: BudgetsStepProps) {
  const t = useTranslations("setup");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories", "expense"],
    queryFn: () => getCategories("expense"),
  });

  const [amounts, setAmounts] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);

  const setAmount = (id: number, value: string) => {
    setAmounts((prev) => {
      const next = new Map(prev);
      if (value.trim() === "") {
        next.delete(id);
      } else {
        next.set(id, value);
      }
      return next;
    });
  };

  const budgeted = useMemo(() => {
    const out: Array<{ id: number; amount: number }> = [];
    for (const [id, raw] of amounts.entries()) {
      const parsed = Number(raw.trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        out.push({ id, amount: parsed });
      }
    }
    return out;
  }, [amounts]);

  const total = budgeted.reduce((sum, b) => sum + b.amount, 0);

  const finish = async (commit: boolean) => {
    setSaving(true);
    try {
      if (commit && budgeted.length > 0) {
        await setBudgetModesBulk(budgeted.map((b) => b.id));
        await Promise.all(budgeted.map((b) => updateBudget(b.id, b.amount)));
      }
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-6">
      <header className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t("budgetsStep")}
        </div>
        <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">{t("budgetsTitle")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("budgetsDescription")}</p>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-card/60" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {categories.map((cat) => (
            <CategoryCell
              key={cat.id}
              category={cat}
              value={amounts.get(cat.id) ?? ""}
              onChange={(v) => setAmount(cat.id, v)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{t("budgetsCount", { budgeted: budgeted.length, total: categories.length })}</span>
        {total > 0 && (
          <span className="font-bold tabular-nums text-foreground">
            {t("budgetsTotalPerMonth", { amount: formatCurrency(total, "ILS", locale) })}
          </span>
        )}
      </div>

      <footer className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          ← {tc("back")}
        </Button>
        <Button onClick={() => finish(true)} disabled={saving || isLoading}>
          {saving ? tc("saving") : `${tc("continue")} →`}
        </Button>
      </footer>

      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={() => finish(false)}
          disabled={saving}
          className="text-[11px] text-muted-foreground underline decoration-muted-foreground/30 underline-offset-4 transition-colors hover:text-foreground"
        >
          {t("budgetsSkip")}
        </button>
      </div>
    </div>
  );
}

function CategoryCell({
  category,
  value,
  onChange,
}: {
  category: Category;
  value: string;
  onChange: (v: string) => void;
}) {
  const Icon = getCategoryIcon(category.icon);
  const accent = shade(category.color);
  const filled = value.trim() !== "" && Number(value.trim()) > 0;

  return (
    <label
      className="group flex min-w-0 items-center gap-1.5 rounded-lg border bg-card px-1.5 py-1.5 transition-colors"
      style={{
        borderColor: filled ? accent : "var(--border)",
        background: filled ? `color-mix(in oklch, ${category.color} 10%, var(--card))` : undefined,
      }}
    >
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{ background: tint(category.color, 0.18) }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="min-w-0 flex-1 cursor-default truncate text-[11px] font-medium">
              {category.name}
            </span>
          }
        />
        <TooltipContent side="top" sideOffset={6}>
          {category.name}
        </TooltipContent>
      </Tooltip>
      <div className="flex items-baseline gap-0.5">
        <span className="text-[10px] text-muted-foreground">₪</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          className="w-12 border-0 bg-transparent p-0 text-end text-[11px] tabular-nums outline-none placeholder:text-muted-foreground/40 focus:underline focus:decoration-foreground/30 focus:underline-offset-4"
          style={{
            fontWeight: filled ? 600 : 400,
          }}
        />
      </div>
    </label>
  );
}
