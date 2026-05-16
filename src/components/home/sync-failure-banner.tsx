"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HomeBankHealthItem } from "@/lib/types";

interface Props {
  items: HomeBankHealthItem[] | null;
  className?: string;
}

const TWO_FA_RE = /2fa|otp|verification|change[_ ]?password|invalid[_ ]?password/i;

function isToday(iso: string): boolean {
  const now = new Date();
  const synced = new Date(iso + "Z");
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  return fmt(now) === fmt(synced);
}

function truncate(s: string, max = 120): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

export function SyncFailureBanner({ items, className }: Props) {
  if (!items) return null;
  const failures = items.filter(
    (i) => i.status === "error" && i.lastSyncAt && isToday(i.lastSyncAt)
  );
  if (failures.length === 0) return null;

  const headline =
    failures.length === 1
      ? `Sync failed for ${failures[0].providerName}`
      : `Sync failed for ${failures.length} banks`;

  const showsTwoFAHint = failures.some(
    (f) => f.errorMessage && TWO_FA_RE.test(f.errorMessage)
  );

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5",
        className
      )}
      style={{
        background:
          "color-mix(in oklch, var(--status-over) 12%, var(--card))",
        borderColor:
          "color-mix(in oklch, var(--status-over) 40%, var(--border))",
      }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{
          background:
            "color-mix(in oklch, var(--status-over) 24%, var(--card))",
          color: "var(--status-over)",
        }}
      >
        <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-serif text-base leading-tight tracking-tight">
          {headline}
        </div>
        <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
          {failures.map((f) => (
            <li key={f.provider} className="truncate">
              <span className="font-medium text-foreground/80">
                {f.providerName}:
              </span>{" "}
              {truncate(f.errorMessage ?? "Sync failed")}
            </li>
          ))}
        </ul>
        {showsTwoFAHint && (
          <p className="mt-2 text-xs text-muted-foreground">
            Some banks (notably Yahav) block scraping when 2FA is on. Disable
            it on the bank side and try again.
          </p>
        )}
      </div>

      <Button
        size="sm"
        nativeButton={false}
        className="self-start sm:self-auto"
        render={<Link href="/settings/bank">Reconnect bank</Link>}
      />
    </div>
  );
}
