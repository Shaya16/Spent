"use client";

import { CircleCheck, ListChecks } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { HomeNeedsAttention } from "@/lib/types";

export function AttentionStrip({ data }: { data: HomeNeedsAttention }) {
  const t = useTranslations("home");
  const total = data.uncategorized + data.lowConfidence + data.flagged;

  if (total === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm text-muted-foreground">
        <CircleCheck className="h-4 w-4 text-status-on-track" />
        {t("attentionAllClear")}
      </div>
    );
  }

  const parts: string[] = [];
  if (data.uncategorized) parts.push(t("attentionUncategorized", { count: data.uncategorized }));
  if (data.lowConfidence) parts.push(t("attentionLowConfidence", { count: data.lowConfidence }));
  if (data.flagged) parts.push(t("attentionFlagged", { count: data.flagged }));

  return (
    <Link
      href="/transactions"
      className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-3 transition-colors hover:bg-accent/40"
    >
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{parts.join(" · ")}</span>
      </span>
      <span className="shrink-0 text-xs font-medium text-muted-foreground group-hover:text-foreground">
        {t("attentionReview")}
      </span>
    </Link>
  );
}
