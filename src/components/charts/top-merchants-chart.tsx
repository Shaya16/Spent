"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MerchantSummary } from "@/lib/types";

interface TopMerchantsChartProps {
  data: MerchantSummary[];
  loading: boolean;
}

export function TopMerchantsChart({ data, loading }: TopMerchantsChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Top Merchants</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data
    .slice(0, 10)
    .map((d) => ({
      name: d.name.length > 25 ? d.name.slice(0, 22) + "..." : d.name,
      fullName: d.name,
      amount: Math.round(d.amount),
      count: d.count,
    }))
    .reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Top Merchants</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No data yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={chartData.length * 36 + 20}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
              <XAxis
                type="number"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `₪${v.toLocaleString()}`}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                axisLine={false}
                tickLine={false}
                width={110}
              />
              <Tooltip
                formatter={(value) => [
                  `₪${Number(value).toLocaleString()}`,
                  "Spend",
                ]}
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
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
