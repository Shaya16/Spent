"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatLastSync, formatJerusalemTimeOfDay } from "@/lib/formatters";
import type { HomeBankHealthItem } from "@/lib/types";

interface Props {
  items: HomeBankHealthItem[] | null;
  nextScheduledSync: string | null;
}

type PillTone = "ok" | "warn" | "error" | "muted";

interface PillState {
  tone: PillTone;
  label: string;
  detail: string | null;
}

function describe(items: HomeBankHealthItem[] | null): PillState {
  if (!items || items.length === 0) {
    return { tone: "muted", label: "No banks connected", detail: null };
  }

  const errors = items.filter((i) => i.status === "error");
  if (errors.length > 0) {
    return {
      tone: "error",
      label:
        errors.length === 1
          ? "1 bank failed"
          : `${errors.length} banks failed`,
      detail: errors.map((e) => e.providerName).join(", "),
    };
  }

  const okItems = items.filter((i) => i.status === "ok");
  const staleItems = items.filter((i) => i.status === "stale");
  const everSynced = items.filter((i) => i.lastSyncAt != null);

  if (everSynced.length === 0) {
    return { tone: "muted", label: "Never synced", detail: null };
  }

  const oldestSync = everSynced.reduce<string | null>((oldest, i) => {
    if (!i.lastSyncAt) return oldest;
    if (!oldest) return i.lastSyncAt;
    return new Date(i.lastSyncAt + "Z").getTime() <
      new Date(oldest + "Z").getTime()
      ? i.lastSyncAt
      : oldest;
  }, null);

  if (staleItems.length > 0 && okItems.length === 0) {
    return {
      tone: "warn",
      label: `Last sync ${formatLastSync(oldestSync)}`,
      detail: staleItems.map((s) => s.providerName).join(", "),
    };
  }

  return {
    tone: "ok",
    label: `Synced ${formatLastSync(oldestSync)}`,
    detail: null,
  };
}

const TONE_STYLES: Record<PillTone, { dot: string; text: string; ring: string }> = {
  ok: {
    dot: "bg-[var(--status-on-track)]",
    text: "text-foreground",
    ring: "ring-[color-mix(in_oklch,var(--status-on-track)_30%,var(--border))]",
  },
  warn: {
    dot: "bg-[var(--status-heads-up)]",
    text: "text-foreground",
    ring: "ring-[color-mix(in_oklch,var(--status-heads-up)_35%,var(--border))]",
  },
  error: {
    dot: "bg-[var(--status-over)]",
    text: "text-[var(--status-over)]",
    ring: "ring-[color-mix(in_oklch,var(--status-over)_45%,var(--border))]",
  },
  muted: {
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    ring: "ring-border",
  },
};

export function SyncStatusPill({ items, nextScheduledSync }: Props) {
  const state = useMemo(() => describe(items), [items]);
  const styles = TONE_STYLES[state.tone];

  const nextText = nextScheduledSync
    ? `next ${formatJerusalemTimeOfDay(nextScheduledSync)}`
    : null;

  const tooltip = [state.detail, nextText && `Next auto-sync at ${formatJerusalemTimeOfDay(nextScheduledSync!)}`]
    .filter(Boolean)
    .join(" • ");

  const handleClick = () => {
    const el = document.getElementById("bank-health");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={tooltip || undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs ring-1 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        styles.text,
        styles.ring
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", styles.dot)} />
      <span className="font-medium">{state.label}</span>
      {nextText && (
        <>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-muted-foreground">{nextText}</span>
        </>
      )}
    </button>
  );
}
