"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingBasket,
  UtensilsCrossed,
  TramFront,
  ShoppingBag,
  Ticket,
  HeartPulse,
  GraduationCap,
  Receipt,
  RefreshCw,
  Plane,
  Banknote,
  ArrowLeftRight,
  Shield,
  Home,
  Sparkles,
  CircleDot,
  Coffee,
  PawPrint,
  Gift,
  Baby,
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCategories, setBudgetModesBulk, updateBudget } from "@/lib/api";
import type { Category } from "@/lib/types";

const ICON_MAP: Record<string, LucideIcon> = {
  "shopping-basket": ShoppingBasket,
  "utensils-crossed": UtensilsCrossed,
  "tram-front": TramFront,
  "shopping-bag": ShoppingBag,
  ticket: Ticket,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  receipt: Receipt,
  "refresh-cw": RefreshCw,
  plane: Plane,
  banknote: Banknote,
  "arrow-left-right": ArrowLeftRight,
  shield: Shield,
  home: Home,
  sparkles: Sparkles,
  "circle-dot": CircleDot,
  coffee: Coffee,
  "paw-print": PawPrint,
  gift: Gift,
  baby: Baby,
  briefcase: Briefcase,
};

interface BudgetsStepProps {
  onComplete: () => void;
  onBack: () => void;
}

export function BudgetsStep({ onComplete, onBack }: BudgetsStepProps) {
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
        await Promise.all(
          budgeted.map((b) => updateBudget(b.id, b.amount))
        );
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
          Step 4 of 5
        </div>
        <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">
          Set a budget for each category
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Type an amount for the ones you want to cap. Leave blank to just track.
        </p>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="h-9 animate-pulse rounded-lg bg-card/60"
            />
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
        <span>
          {budgeted.length} of {categories.length} budgeted
        </span>
        {total > 0 && (
          <span className="font-bold tabular-nums text-foreground">
            ₪ {total.toLocaleString()} / month
          </span>
        )}
      </div>

      <footer className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          ← Back
        </Button>
        <Button onClick={() => finish(true)} disabled={saving || isLoading}>
          {saving ? "Saving..." : "Continue →"}
        </Button>
      </footer>

      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={() => finish(false)}
          disabled={saving}
          className="text-[11px] text-muted-foreground underline decoration-muted-foreground/30 underline-offset-4 transition-colors hover:text-foreground"
        >
          Skip, auto-set from spending after first sync
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
  const Icon = ICON_MAP[category.icon ?? "circle-dot"] ?? CircleDot;
  const accent = shade(category.color);
  const filled = value.trim() !== "" && Number(value.trim()) > 0;

  return (
    <label
      title={category.name}
      className="group flex min-w-0 items-center gap-1.5 rounded-lg border bg-card px-1.5 py-1.5 transition-colors"
      style={{
        borderColor: filled ? accent : "var(--border)",
        background: filled
          ? `color-mix(in oklch, ${category.color} 10%, var(--card))`
          : undefined,
      }}
    >
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{ background: tint(category.color, 0.18) }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
      </div>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
        {category.name}
      </span>
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
          className="w-12 border-0 bg-transparent p-0 text-right text-[11px] tabular-nums outline-none placeholder:text-muted-foreground/40 focus:underline focus:decoration-foreground/30 focus:underline-offset-4"
          style={{
            fontWeight: filled ? 600 : 400,
          }}
        />
      </div>
    </label>
  );
}

function tint(hex: string, opacity: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function shade(hex: string): string {
  const { r, g, b } = parseHex(hex);
  const factor = 0.78;
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
