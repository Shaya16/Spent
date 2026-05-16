"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Check,
  X,
  Loader2,
  Sparkles,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { BANK_PROVIDERS } from "@/lib/types";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { cn } from "@/lib/utils";

type RowStatus =
  | "idle"
  | "running"
  | "awaiting-otp"
  | "manual-2fa"
  | "done"
  | "error";

export interface ProviderRow {
  provider: string;
  status: RowStatus;
  added: number;
  updated: number;
  errorMessage?: string;
  syncRunId?: number;
}

interface SyncProgressDialogProps {
  open: boolean;
  providers: string[];
  rows: ProviderRow[];
  stage: string | null;
  done: boolean;
  summary: { added: number; updated: number; categorized: number } | null;
  aiWarning?: string | null;
  onClose: () => void;
  onSubmitOtp?: (syncRunId: number, code: string) => Promise<void>;
}

const STAGE_LABELS: Record<string, string> = {
  "ollama-start": "Starting Ollama…",
  categorizing: "Categorizing with AI…",
  "memory-hit": "Recognized from memory",
};

export function SyncProgressDialog({
  open,
  providers,
  rows,
  stage,
  done,
  summary,
  aiWarning,
  onClose,
  onSubmitOtp,
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
          <HeroDots done={done} warning={Boolean(aiWarning)} />
          <DialogTitle className="mt-4 text-center font-serif text-2xl font-normal">
            {done
              ? aiWarning
                ? "Synced — categorization skipped"
                : "All synced!"
              : "Syncing your accounts"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-center text-xs">
            {done
              ? aiWarning
                ? "Connect an AI provider to auto-categorize transactions."
                : "Pulling fresh data from your banks. You're up to date."
              : stage
                ? STAGE_LABELS[stage] ?? "Working…"
                : "Reaching out to your banks…"}
          </DialogDescription>
        </div>

        <div className="space-y-2 px-6 pb-2">
          {fullRows.map((row) => (
            <ProviderRowView
              key={row.provider}
              row={row}
              onSubmitOtp={onSubmitOtp}
            />
          ))}
        </div>

        {summary && (
          <div className="mx-6 mb-4 mt-2 overflow-hidden rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-around gap-3 text-center">
              <SummaryStat label="New" value={summary.added} accent />
              <Divider />
              <SummaryStat label="Updated" value={summary.updated} />
              <Divider />
              <SummaryStat label="Categorized" value={summary.categorized} />
            </div>
          </div>
        )}

        {done && aiWarning && (
          <div
            className="mx-6 mb-6 flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center"
            style={{
              background:
                "color-mix(in oklch, var(--status-heads-up) 14%, var(--card))",
              borderColor:
                "color-mix(in oklch, var(--status-heads-up) 35%, var(--border))",
            }}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{
                background:
                  "color-mix(in oklch, var(--status-heads-up) 28%, var(--card))",
                color: "var(--status-heads-up)",
              }}
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <p className="min-w-0 flex-1 text-muted-foreground">{aiWarning}</p>
            <Button
              size="sm"
              nativeButton={false}
              className="self-start sm:self-auto"
              render={<Link href="/settings/ai">Connect AI</Link>}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProviderRowView({
  row,
  onSubmitOtp,
}: {
  row: ProviderRow;
  onSubmitOtp?: (syncRunId: number, code: string) => Promise<void>;
}) {
  const info = BANK_PROVIDERS.find((b) => b.id === row.provider);
  const label = info?.name ?? row.provider;
  const color = info?.color ?? "#888";
  const isInteractive2fa = row.status === "awaiting-otp";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-3 transition-all duration-300",
        row.status === "running" &&
          "shadow-[0_0_0_1px_color-mix(in_oklch,var(--ring)_30%,transparent)]",
        isInteractive2fa &&
          "shadow-[0_0_0_1px_color-mix(in_oklch,var(--status-heads-up)_50%,transparent)]"
      )}
    >
      <div className="relative flex items-center gap-3">
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
            {row.status === "awaiting-otp" &&
              "Enter the one-time code we just sent you"}
            {row.status === "manual-2fa" && (
              <span className="inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                Solve the 2FA in the popup window
              </span>
            )}
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

      {isInteractive2fa && onSubmitOtp && row.syncRunId ? (
        <OtpInputArea
          syncRunId={row.syncRunId}
          onSubmit={onSubmitOtp}
        />
      ) : null}
    </div>
  );
}

function OtpInputArea({
  syncRunId,
  onSubmit,
}: {
  syncRunId: number;
  onSubmit: (syncRunId: number, code: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(syncRunId, trimmed);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the code.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative mt-3 flex items-center gap-2 border-t border-border/60 pt-3"
    >
      <Input
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="6-digit code"
        className="font-mono"
        disabled={submitting}
        aria-label="One-time code"
      />
      <Button
        type="submit"
        size="sm"
        disabled={submitting || code.trim().length < 4}
      >
        {submitting ? "Submitting…" : "Submit"}
      </Button>
      {error && (
        <p className="absolute -bottom-5 left-0 text-[11px] text-destructive">
          {error}
        </p>
      )}
    </form>
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
  if (status === "awaiting-otp") {
    return (
      <div
        className="flex h-6 w-6 items-center justify-center rounded-full"
        style={{ background: "var(--status-heads-up)" }}
        aria-label="Waiting for one-time code"
      >
        <ShieldCheck className="h-3.5 w-3.5 text-background" strokeWidth={2.5} />
      </div>
    );
  }
  if (status === "manual-2fa") {
    return (
      <Loader2
        className="h-4 w-4 animate-spin"
        style={{ color: "var(--status-heads-up)" }}
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

function HeroDots({ done, warning }: { done: boolean; warning?: boolean }) {
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
              style={{
                background: warning
                  ? "var(--status-heads-up)"
                  : "var(--status-on-track)",
              }}
            >
              {warning ? (
                <Sparkles
                  className="h-5 w-5 text-background"
                  strokeWidth={2.5}
                />
              ) : (
                <Check className="h-5 w-5 text-background" strokeWidth={3} />
              )}
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
