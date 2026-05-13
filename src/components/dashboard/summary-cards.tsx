"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import type { CategoryBreakdown } from "@/lib/types";

interface SummaryCardsProps {
  total: number;
  count: number;
  topCategory?: CategoryBreakdown;
  loading: boolean;
}

export function SummaryCards({
  total,
  count,
  topCategory,
  loading,
}: SummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Spend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">
            {formatCurrency(total)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">{count}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Top Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topCategory ? (
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: topCategory.color }}
              />
              <span className="text-lg font-semibold">{topCategory.name}</span>
              <span className="text-sm text-muted-foreground">
                {formatCurrency(topCategory.amount)}
              </span>
            </div>
          ) : (
            <div className="text-lg text-muted-foreground">No data</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
