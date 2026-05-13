"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  HelpCircle,
  Check,
  ChevronDown,
  type LucideIcon,
  CircleDot,
} from "lucide-react";
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
  Briefcase,
} from "lucide-react";
import {
  approveTransactionCategory,
  getCategories,
  getCategoryDetail,
  updateTransactionCategory,
  type CategoryDetail,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Category, TransactionWithCategory } from "@/lib/types";

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
  briefcase: Briefcase,
};

interface BudgetDetailSheetProps {
  categoryId: number | null;
  from: string;
  to: string;
  onClose: () => void;
}

export function BudgetDetailSheet({
  categoryId,
  from,
  to,
  onClose,
}: BudgetDetailSheetProps) {
  const open = categoryId !== null;

  const detailQuery = useQuery({
    enabled: open && categoryId !== null,
    queryKey: ["category-detail", categoryId, from, to],
    queryFn: () => getCategoryDetail(categoryId as number, { from, to }),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-xl md:max-w-2xl lg:max-w-4xl"
      >
        {detailQuery.isLoading || !detailQuery.data ? (
          <DetailSkeleton />
        ) : (
          <DetailContent data={detailQuery.data} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-12 w-3/4" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function DetailContent({ data }: { data: CategoryDetail }) {
  const queryClient = useQueryClient();
  const sameKindCategoriesQuery = useQuery({
    queryKey: ["categories", data.category.kind],
    queryFn: () => getCategories(data.category.kind),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["category-detail"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };

  const handleApprove = async (id: number) => {
    await approveTransactionCategory(id);
    invalidate();
  };
  const handleChangeCategory = async (id: number, categoryId: number) => {
    await updateTransactionCategory(id, categoryId);
    invalidate();
  };

  const Icon = ICON_MAP[data.category.icon ?? "circle-dot"] ?? CircleDot;
  const tintBg = tint(data.category.color, 0.18);
  const iconColor = shade(data.category.color);
  const pct = Math.min(100, Math.round(data.percentSpent));

  const chartData = useMemo(
    () =>
      data.dailySpend.map((d) => ({
        day: d.date.slice(8, 10),
        amount: d.amount,
        date: d.date,
      })),
    [data.dailySpend]
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader
        className="gap-3 p-6 pb-5"
        style={{ background: tint(data.category.color, 0.22) }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background/70"
          >
            <Icon className="h-5 w-5" style={{ color: iconColor }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {data.category.kind === "income"
                ? "Income category"
                : "Expense category"}
            </div>
            <SheetTitle className="truncate font-serif text-2xl font-normal">
              {data.category.name}
            </SheetTitle>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-3">
          <Stat label="Spent" value={formatCurrency(data.spent)} />
          <Stat
            label="Budget"
            value={
              data.budget > 0 ? formatCurrency(data.budget) : "—"
            }
            sublabel={data.isAutoBudget ? "auto" : undefined}
          />
          <Stat
            label="Left"
            value={formatCurrency(Math.max(0, data.budget - data.spent))}
          />
        </div>

        {data.budget > 0 && (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background/40">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: shade(data.category.color),
              }}
            />
          </div>
        )}
      </SheetHeader>

      <div className="space-y-5 p-6 pt-3">
        {data.needsReviewCount > 0 && (
          <NeedsReviewSection
            transactions={data.needsReviewTransactions}
            categories={sameKindCategoriesQuery.data ?? []}
            onApprove={handleApprove}
            onChange={handleChangeCategory}
            color={data.category.color}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardLabel>VS. LAST MONTH</CardLabel>
            <div className="mt-1 font-serif text-2xl tabular-nums">
              {data.prevSpent > 0
                ? `${data.spent - data.prevSpent >= 0 ? "+" : "-"}${formatCurrency(Math.abs(data.spent - data.prevSpent))}`
                : "—"}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {data.prevSpent > 0 ? (
                <>
                  {data.prevPeriodLabel}: {formatCurrency(data.prevSpent)}
                  {data.vsLastMonth != null && (
                    <>
                      {" · "}
                      {Math.abs(Math.round(data.vsLastMonth))}%{" "}
                      {data.vsLastMonth < 0 ? "lower" : "higher"}
                    </>
                  )}
                </>
              ) : (
                "No spending last period"
              )}
            </div>
          </Card>

          <Card>
            <CardLabel>AVG / TRANSACTION</CardLabel>
            <div className="mt-1 font-serif text-2xl tabular-nums">
              {formatCurrency(data.avgPerTransaction)}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {data.transactionCount} transaction
              {data.transactionCount === 1 ? "" : "s"} this period
            </div>
          </Card>
        </div>

        <Card>
          <CardLabel>DAILY SPEND THIS PERIOD</CardLabel>
          <div className="mt-2 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 0, bottom: 4, left: 0 }}
              >
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <Tooltip
                  cursor={{ fill: tint(data.category.color, 0.1) }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as {
                      day: string;
                      amount: number;
                      date: string;
                    };
                    return (
                      <div className="rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
                        <div className="font-medium">
                          {formatDate(p.date)}
                        </div>
                        <div className="tabular-nums text-muted-foreground">
                          {formatCurrency(p.amount)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.amount > 0
                          ? shade(data.category.color)
                          : tint(data.category.color, 0.18)
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Transactions · {data.transactionCount}
            </h3>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              disabled
              title="Manual transaction entry not available yet"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-card">
            {data.transactions.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No transactions in this category for this period.
              </div>
            ) : (
              <ul className="divide-y">
                {data.transactions.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-medium">
                        {t.description}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(t.date)}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-medium tabular-nums">
                      {formatCurrency(t.chargedAmount)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NeedsReviewSection({
  transactions,
  categories,
  onApprove,
  onChange,
  color,
}: {
  transactions: TransactionWithCategory[];
  categories: Category[];
  onApprove: (id: number) => void;
  onChange: (id: number, categoryId: number) => void;
  color: string;
}) {
  return (
    <div
      className="space-y-2 rounded-2xl p-4"
      style={{ background: tint(color, 0.12) }}
    >
      <div className="flex items-center gap-2">
        <HelpCircle
          className="h-4 w-4"
          style={{ color: "var(--status-heads-up)" }}
        />
        <h3 className="text-sm font-medium">
          Needs review · {transactions.length}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        The AI wasn&apos;t sure about these. Approve to keep, or pick a different
        category. Either way, the choice is remembered for next time.
      </p>
      <ul className="mt-2 space-y-2">
        {transactions.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-background/70 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="break-words text-sm font-medium">
                {t.description}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatDate(t.date)} · {formatCurrency(t.chargedAmount)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                >
                  <Badge
                    variant="outline"
                    className="border-none p-0"
                    style={{
                      color: t.categoryColor ?? undefined,
                    }}
                  >
                    {t.categoryName ?? "Uncategorized"}
                  </Badge>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {categories.map((cat) => (
                    <DropdownMenuItem
                      key={cat.id}
                      onClick={() => onChange(t.id, cat.id)}
                    >
                      <div
                        className="mr-2 h-2 w-2 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => onApprove(t.id)}
              >
                <Check className="h-3.5 w-3.5" />
                Approve
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-serif text-xl tabular-nums">{value}</div>
      {sublabel && (
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {sublabel}
        </div>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-4">{children}</div>;
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </div>
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

