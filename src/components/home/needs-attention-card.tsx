"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CircleHelp,
  Flag,
} from "lucide-react";
import { CardShell } from "./card-shell";
import type { HomeNeedsAttention } from "@/lib/types";

interface Props {
  data: HomeNeedsAttention;
}

export function NeedsAttentionCard({ data }: Props) {
  const { uncategorized, lowConfidence, flagged } = data;
  const total = uncategorized + lowConfidence + flagged;

  if (total === 0) {
    return (
      <CardShell label="Needs attention">
        <div className="flex flex-1 items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--status-on-track)]" />
          All clear.
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell label="Needs attention">
      <ul className="flex flex-1 flex-col gap-2">
        <Row
          icon={<CircleHelp className="h-4 w-4" />}
          label="Uncategorized"
          count={uncategorized}
          href="/transactions"
        />
        <Row
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Low AI confidence"
          count={lowConfidence}
          href="/transactions"
        />
        <Row
          icon={<Flag className="h-4 w-4" />}
          label="Flagged for review"
          count={flagged}
          href="/transactions"
        />
      </ul>
    </CardShell>
  );
}

function Row({
  icon,
  label,
  count,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  href: string;
}) {
  if (count === 0) {
    return (
      <li className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2.5">
          <span className="text-muted-foreground/60">{icon}</span>
          {label}
        </span>
        <span className="text-xs tabular-nums">0</span>
      </li>
    );
  }
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors hover:bg-accent/50"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-foreground/80">{icon}</span>
          {label}
        </span>
        <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium tabular-nums group-hover:bg-foreground/15">
          {count}
        </span>
      </Link>
    </li>
  );
}
