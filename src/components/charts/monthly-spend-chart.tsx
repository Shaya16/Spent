"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MonthlySummary } from "@/lib/types";

interface MonthlySpendChartProps {
  data: MonthlySummary[];
  loading: boolean;
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1);
  return date.toLocaleDateString("en-US", { month: "short" });
}

export function MonthlySpendChart({ data, loading }: MonthlySpendChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Monthly Spend</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    month: formatMonth(d.month),
    amount: Math.round(d.amount),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Monthly Spend</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No data yet. Sync to see your spending.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-border"
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `₪${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value) => [`₪${Number(value).toLocaleString()}`, "Spend"]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--popover)",
                  color: "var(--popover-foreground)",
                }}
              />
              <Bar
                dataKey="amount"
                fill="var(--primary)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
