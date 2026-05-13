"use client";

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
  HelpCircle,
  Coffee,
  PawPrint,
  Gift,
  Baby,
  Briefcase,
  TrendingUp,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { CategoryWithData, BudgetStatus } from "@/lib/types";

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
  "trending-up": TrendingUp,
  "rotate-ccw": RotateCcw,
};

interface CategoryCardProps {
  data: CategoryWithData;
  onClick?: () => void;
}

export function CategoryCard({ data, onClick }: CategoryCardProps) {
  const Icon = ICON_MAP[data.categoryIcon ?? "circle-dot"] ?? CircleDot;
  const percent = Math.min(999, Math.round(data.percentSpent));
  const vsLast = data.vsLastMonth;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full cursor-pointer rounded-2xl border border-border bg-card p-5 text-left transition-colors duration-200 ease-out hover:border-[#D6C9AC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: tint(data.categoryColor, 0.18) }}
          >
            <Icon className="h-5 w-5" style={{ color: shade(data.categoryColor) }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-medium leading-tight">
                {data.categoryName}
              </span>
              {data.needsReviewCount > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                  style={{
                    backgroundColor:
                      "color-mix(in oklch, var(--status-heads-up) 18%, transparent)",
                    color: "var(--status-heads-up)",
                  }}
                  title={`${data.needsReviewCount} need review`}
                >
                  <HelpCircle className="h-3 w-3" />
                  {data.needsReviewCount}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {data.transactionCount}{" "}
              {data.transactionCount === 1 ? "transaction" : "transactions"}
              {data.topMerchant ? ` · mostly ${data.topMerchant}` : ""}
            </div>
          </div>
        </div>
        <ProgressDonut
          percent={percent}
          color={data.categoryColor}
          status={data.status}
        />
      </div>

      <div className="mt-4">
        <div className="font-serif text-3xl tabular-nums">
          {formatCurrency(data.spent)}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {data.budget > 0 ? (
            <span className="tabular-nums">of {formatCurrency(data.budget)}</span>
          ) : (
            <span>no budget set</span>
          )}
          {vsLast != null && (
            <VsLastMonth pct={vsLast} />
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 text-xs">
        <div className="text-muted-foreground tabular-nums">
          {data.budget > 0 ? (
            data.spent <= data.budget ? (
              <>
                {formatCurrency(data.remaining)} left
                {data.perDayRemaining != null && (
                  <> · ≈ {formatCurrency(data.perDayRemaining)}/day</>
                )}
              </>
            ) : (
              <>
                <span className="text-[var(--status-over)]">
                  {formatCurrency(data.spent - data.budget)} over
                </span>
                {" · ease up"}
              </>
            )
          ) : (
            <span>set a budget to track pacing</span>
          )}
        </div>
        <StatusPill status={data.status} />
      </div>
    </button>
  );
}

function ProgressDonut({
  percent,
  color,
  status,
}: {
  percent: number;
  color: string;
  status: BudgetStatus;
}) {
  const size = 52;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Clamp to 100% for visual but show actual % in text
  const visualPercent = Math.min(100, percent);
  const dash = (visualPercent / 100) * circumference;
  const strokeColor =
    status === "over" ? "var(--status-over)" : shade(color);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tint(color, 0.18)}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-medium tabular-nums">
        {percent}%
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: BudgetStatus }) {
  const meta: Record<BudgetStatus, { label: string; color: string }> = {
    "plenty-left": {
      label: "Plenty left",
      color: "var(--status-plenty-left)",
    },
    "on-track": { label: "On track", color: "var(--status-on-track)" },
    "heads-up": { label: "Heads up", color: "var(--status-heads-up)" },
    over: { label: "Over", color: "var(--status-over)" },
  };
  const m = meta[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums"
      style={{
        backgroundColor: `color-mix(in oklch, ${m.color} 18%, transparent)`,
        color: m.color,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: m.color }}
      />
      {m.label}
    </span>
  );
}

function VsLastMonth({ pct }: { pct: number }) {
  const rounded = Math.round(pct);
  if (Math.abs(rounded) < 1) {
    return <span className="text-muted-foreground">flat vs last month</span>;
  }
  const up = rounded > 0;
  return (
    <span
      className={
        up
          ? "text-[var(--status-over)]"
          : "text-[var(--status-on-track)]"
      }
    >
      {up ? "↑" : "↓"} {Math.abs(rounded)}% vs last month
    </span>
  );
}

function tint(hex: string, opacity: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function shade(hex: string): string {
  // Slight darken so colored icons read against the cream card.
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
