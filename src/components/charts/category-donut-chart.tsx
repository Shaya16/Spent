"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryBreakdown } from "@/lib/types";

interface CategoryDonutChartProps {
  data: CategoryBreakdown[];
  loading: boolean;
}

export function CategoryDonutChart({ data, loading }: CategoryDonutChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Spend by Category
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    name: d.name,
    value: Math.round(d.amount),
    color: d.color,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Spend by Category
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No data yet.
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="55%" height={250}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [
                    `₪${Number(value).toLocaleString()}`,
                    "",
                  ]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--popover)",
                    color: "var(--popover-foreground)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-1 flex-col gap-1.5 overflow-hidden">
              {chartData.slice(0, 7).map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center gap-2 text-xs"
                >
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="truncate">{entry.name}</span>
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    ₪{entry.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
