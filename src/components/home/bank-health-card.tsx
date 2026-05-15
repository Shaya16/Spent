"use client";

import Link from "next/link";
import { CardShell, CardAction } from "./card-shell";
import type { HomeBankHealthItem } from "@/lib/types";

interface Props {
  items: HomeBankHealthItem[];
}

export function BankHealthCard({ items }: Props) {
  if (items.length === 0) {
    return (
      <CardShell
        label="Bank connections"
        action={<CardAction href="/settings/bank">Manage →</CardAction>}
      >
        <div className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground">
          No banks connected yet.
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      label="Bank connections"
      action={<CardAction href="/settings/bank">Manage →</CardAction>}
    >
      <ul className="flex flex-1 flex-col gap-3">
        {items.map((item) => (
          <li key={item.provider}>
            <Row item={item} />
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function Row({ item }: { item: HomeBankHealthItem }) {
  const { providerName, lastSyncAt, status, errorMessage } = item;

  return (
    <Link
      href="/settings/bank"
      className="flex items-center justify-between rounded-xl px-2 py-1.5 transition-colors hover:bg-accent/40"
      title={errorMessage ?? undefined}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot status={status} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{providerName}</div>
          <div className="text-xs text-muted-foreground">
            {formatLastSync(lastSyncAt, status)}
          </div>
        </div>
      </div>
      <StatusLabel status={status} />
    </Link>
  );
}

function StatusDot({ status }: { status: HomeBankHealthItem["status"] }) {
  const cls =
    status === "ok"
      ? "bg-[var(--status-on-track)]"
      : status === "stale"
        ? "bg-[var(--status-heads-up)]"
        : status === "error"
          ? "bg-[var(--status-over)]"
          : "bg-muted-foreground/40";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}

function StatusLabel({ status }: { status: HomeBankHealthItem["status"] }) {
  const text =
    status === "ok"
      ? "OK"
      : status === "stale"
        ? "Stale"
        : status === "error"
          ? "Error"
          : "Never synced";
  const cls =
    status === "ok"
      ? "text-[var(--status-on-track)]"
      : status === "stale"
        ? "text-[var(--status-heads-up)]"
        : status === "error"
          ? "text-[var(--status-over)]"
          : "text-muted-foreground";
  return <span className={`text-xs font-medium ${cls}`}>{text}</span>;
}

function formatLastSync(
  iso: string | null,
  status: HomeBankHealthItem["status"]
): string {
  if (!iso) return status === "error" ? "Last attempt failed" : "Never synced";
  // The DB returns datetime('now') in UTC without a Z suffix.
  const synced = new Date(iso + "Z").getTime();
  const ageMs = Date.now() - synced;
  if (!Number.isFinite(ageMs) || ageMs < 0) return "just now";

  const sec = Math.floor(ageMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}
