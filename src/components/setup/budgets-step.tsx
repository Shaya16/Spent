"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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
  Check,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCategories, setBudgetModesBulk } from "@/lib/api";
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

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleContinue = async () => {
    setSaving(true);
    try {
      await setBudgetModesBulk(Array.from(selected));
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Step 3 of 4
        </div>
        <h1 className="font-serif text-4xl leading-tight">
          What do you want to budget?
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Pick the categories you actually want to manage with a monthly target.
          The rest will just show your spending each month, with context. You
          can change this anytime.
        </p>
      </header>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="h-[88px] animate-pulse rounded-2xl bg-card/60"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {categories.map((cat) => (
            <CategoryPickerCard
              key={cat.id}
              category={cat}
              selected={selected.has(cat.id)}
              onToggle={() => toggle(cat.id)}
            />
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {selected.size} of {categories.length} selected to budget
        {selected.size === 0 && categories.length > 0 && (
          <> · everything will just be tracked</>
        )}
      </div>

      <footer className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          ← Back
        </Button>
        <Button onClick={handleContinue} disabled={saving || isLoading}>
          {saving ? "Saving..." : "Continue →"}
        </Button>
      </footer>
    </div>
  );
}

function CategoryPickerCard({
  category,
  selected,
  onToggle,
}: {
  category: Category;
  selected: boolean;
  onToggle: () => void;
}) {
  const Icon = ICON_MAP[category.icon ?? "circle-dot"] ?? CircleDot;
  const accent = shade(category.color);
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileTap={{ scale: 0.97 }}
      className="group relative flex items-center gap-3 rounded-2xl border-2 bg-card p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{
        borderColor: selected ? accent : "var(--border)",
        background: selected
          ? `color-mix(in oklch, ${category.color} 8%, var(--card))`
          : undefined,
      }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: tint(category.color, 0.18) }}
      >
        <Icon className="h-5 w-5" style={{ color: accent }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{category.name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {selected ? "Budgeted" : "Just tracking"}
        </div>
      </div>
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
        style={{
          borderColor: selected ? accent : "var(--border)",
          background: selected ? accent : "transparent",
        }}
      >
        {selected && (
          <Check className="h-3 w-3 text-background" strokeWidth={3} />
        )}
      </div>
    </motion.button>
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
