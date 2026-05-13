"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Check, X, Loader2 } from "lucide-react";
import { BANK_PROVIDERS } from "@/lib/types";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { cn } from "@/lib/utils";

type RowStatus = "idle" | "running" | "done" | "error";

interface ProviderRow {
  provider: string;
  status: RowStatus;
  added: number;
  updated: number;
  errorMessage?: string;
}

interface SyncProgressDialogProps {
  open: boolean;
  providers: string[];
  rows: ProviderRow[];
  stage: string | null;
  done: boolean;
  summary: { added: number; updated: number; categorized: number } | null;
  onClose: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  "ollama-start": "Starting Ollama…",
  categorizing: "Categorizing transactions…",
  "memory-hit": "Recognized from memory",
};

export function SyncProgressDialog({
  open,
  providers,
  rows,
  stage,
  done,
  summary,
  onClose,
}: SyncProgressDialogProps) {
  const fullRows = useMemo(() => {
    const map = new Map(rows.map((r) => [r.provider, r]));
    return providers.map<ProviderRow>(
      (p) =>
        map.get(p) ?? {
          provider: p,
          status: "idle",
          added: 0,
          updated: 0,
        }
    );
  }, [providers, rows]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && done) onClose();
      }}
    >
      <DialogContent
        className="max-w-md p-0 sm:max-w-md"
        showCloseButton={done}
      >
        <div className="px-6 pt-6 pb-2">
          <HeroDots done={done} />
          <DialogTitle className="mt-4 text-center font-serif text-2xl font-normal">
            {done ? "All synced!" : "Syncing your accounts"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-center text-xs">
            {done
              ? "Pulling fresh data from your banks. You're up to date."
              : stage
                ? STAGE_LABELS[stage] ?? "Working…"
                : "Reaching out to your banks…"}
          </DialogDescription>
        </div>

        <div className="space-y-2 px-6 pb-2">
          {fullRows.map((row) => (
            <ProviderRowView key={row.provider} row={row} />
          ))}
        </div>

        {summary && (
          <div className="mx-6 mb-6 mt-2 overflow-hidden rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-around gap-3 text-center">
              <SummaryStat label="New" value={summary.added} accent />
              <Divider />
              <SummaryStat label="Updated" value={summary.updated} />
              <Divider />
              <SummaryStat label="Categorized" value={summary.categorized} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProviderRowView({ row }: { row: ProviderRow }) {
  const info = BANK_PROVIDERS.find((b) => b.id === row.provider);
  const label = info?.name ?? row.provider;
  const color = info?.color ?? "#888";

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 overflow-hidden rounded-xl border bg-card p-3 transition-all duration-300",
        row.status === "running" &&
          "shadow-[0_0_0_1px_color-mix(in_oklch,var(--ring)_30%,transparent)]"
      )}
    >
      {row.status === "running" && (
        <div
          className="pointer-events-none absolute inset-0 animate-pulse opacity-60"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${color}22 50%, transparent 100%)`,
          }}
        />
      )}

      <div className="relative">
        <ProviderBadge
          color={color}
          name={label}
          domain={info?.domain}
          size={36}
          radius={10}
        />
      </div>

      <div className="relative min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{label}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {row.status === "idle" && "Waiting…"}
          {row.status === "running" && "Pulling transactions…"}
          {row.status === "done" &&
            (row.added === 0 && row.updated === 0
              ? "Already up to date"
              : `+${row.added} new${row.updated ? ` · ${row.updated} updated` : ""}`)}
          {row.status === "error" &&
            (row.errorMessage?.slice(0, 60) ?? "Failed")}
        </div>
      </div>

      <div className="relative">
        <StatusBadge status={row.status} color={color} />
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  color,
}: {
  status: RowStatus;
  color: string;
}) {
  if (status === "running") {
    return (
      <Loader2
        className="h-4 w-4 animate-spin"
        style={{ color }}
      />
    );
  }
  if (status === "done") {
    return (
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full motion-safe:animate-[checkPop_350ms_cubic-bezier(0.3,1.6,0.4,1)_forwards]"
        style={{ background: "var(--status-on-track)" }}
      >
        <Check className="h-3.5 w-3.5 text-background" strokeWidth={3} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full"
        style={{ background: "var(--status-over)" }}
      >
        <X className="h-3.5 w-3.5 text-background" strokeWidth={3} />
      </div>
    );
  }
  return <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />;
}

function HeroDots({ done }: { done: boolean }) {
  return (
    <div className="flex justify-center">
      <div
        className={cn(
          "relative h-16 w-16",
          done && "motion-safe:animate-[pop_500ms_cubic-bezier(0.3,1.6,0.4,1)_forwards]"
        )}
      >
        <Dot
          x={32}
          y={42}
          r={20}
          color="var(--primary)"
          delay={0}
          done={done}
        />
        <Dot
          x={32}
          y={20}
          r={9}
          color="var(--status-heads-up)"
          delay={150}
          done={done}
        />
        <Dot
          x={48}
          y={28}
          r={7}
          color="var(--status-plenty-left)"
          delay={300}
          done={done}
        />
        {done && (
          <div
            className="absolute inset-0 flex items-center justify-center motion-safe:animate-[fadeIn_500ms_ease-out_forwards]"
            style={{ animationDelay: "200ms", opacity: 0 }}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: "var(--status-on-track)" }}
            >
              <Check className="h-5 w-5 text-background" strokeWidth={3} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Dot({
  x,
  y,
  r,
  color,
  delay,
  done,
}: {
  x: number;
  y: number;
  r: number;
  color: string;
  delay: number;
  done: boolean;
}) {
  return (
    <div
      className="absolute rounded-full"
      style={{
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        background: color,
        animation: done
          ? "none"
          : `dotPulse 1.4s ease-in-out ${delay}ms infinite`,
        opacity: done ? 0.35 : 1,
        transition: "opacity 400ms ease",
      }}
    />
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <span
        className={cn(
          "font-serif text-2xl tabular-nums",
          accent && "text-[var(--status-on-track)]",
          "motion-safe:animate-[countIn_450ms_cubic-bezier(0.3,1.6,0.4,1)_forwards]"
        )}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return <span className="h-8 w-px bg-border" />;
}

export function useAutoClose(
  open: boolean,
  done: boolean,
  delayMs: number,
  onClose: () => void
) {
  useEffect(() => {
    if (!open || !done) return;
    const t = setTimeout(onClose, delayMs);
    return () => clearTimeout(t);
  }, [open, done, delayMs, onClose]);
}
