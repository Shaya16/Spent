"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Wrench, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const FRIENDLY_NAMES: Record<string, string> = {
  get_period_summary: "Reading period summary",
  get_monthly_trend: "Reading monthly trend",
  get_category_breakdown: "Reading category breakdown",
  get_category_detail: "Reading category detail",
  list_transactions: "Listing transactions",
  get_top_merchants: "Reading top merchants",
  get_budgets: "Reading budgets",
  find_recurring_charges: "Scanning recurring charges",
};

function friendlyLabel(name: string): string {
  return FRIENDLY_NAMES[name] ?? name.replace(/_/g, " ");
}

function describeInput(input: unknown): string | null {
  if (input == null || typeof input !== "object") return null;
  const entries = Object.entries(input as Record<string, unknown>).filter(
    ([, v]) => v != null && v !== ""
  );
  if (entries.length === 0) return null;
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}

export interface ToolCallCardProps {
  name: string;
  input: unknown;
  status: "running" | "done" | "error";
  output?: unknown;
  truncated?: boolean;
}

export function ToolCallCard({
  name,
  input,
  status,
  output,
  truncated,
}: ToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const summary = describeInput(input);
  const Icon = status === "error" ? AlertTriangle : Wrench;

  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/40 text-xs transition-colors",
        status === "error" && "border-destructive/40 bg-destructive/5"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {status === "running" ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              status === "error" ? "text-destructive" : "text-muted-foreground"
            )}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{friendlyLabel(name)}</div>
          {summary && (
            <div className="truncate text-[11px] text-muted-foreground">
              {summary}
            </div>
          )}
        </div>
        {status !== "running" &&
          (open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          ))}
      </button>

      {open && status !== "running" && (
        <div className="border-t bg-background/60 px-3 py-2">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Input
          </div>
          <pre className="mb-2 overflow-x-auto rounded bg-muted/60 p-2 text-[11px] leading-snug">
            {JSON.stringify(input ?? {}, null, 2)}
          </pre>
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Output {truncated && <span className="text-amber-500">(truncated)</span>}
          </div>
          <pre className="max-h-56 overflow-auto rounded bg-muted/60 p-2 text-[11px] leading-snug">
            {output == null ? "(no output)" : JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
