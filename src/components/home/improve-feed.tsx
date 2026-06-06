"use client";

import {
  AlertTriangle,
  Gauge,
  type LucideIcon,
  PiggyBank,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { SpendInsight } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CardShell } from "./card-shell";

export function ImproveFeed({ insights }: { insights: SpendInsight[] }) {
  const t = useTranslations("home");

  if (insights.length === 0) {
    return (
      <CardShell label={t("improveTitle")}>
        <div className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground">
          {t("improveEmpty")}
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell label={t("improveTitle")}>
      <ul className="flex flex-col gap-3">
        {insights.map((insight) => (
          <InsightRow key={insight.id} insight={insight} />
        ))}
      </ul>
    </CardShell>
  );
}

function InsightRow({ insight }: { insight: SpendInsight }) {
  const t = useTranslations("home");
  const tCat = useTranslations("categoriesSeeded");
  const category = insight.categoryName ? translateCategoryName(insight.categoryName, tCat) : "";
  const amount = insight.amount != null ? formatCurrency(insight.amount) : "";
  const percent = insight.percent != null ? Math.abs(Math.round(insight.percent)) : 0;

  // Literal t() calls so the i18n key checker can trace each key to the "home"
  // namespace (it cannot follow a `t` passed through a helper function).
  let Icon: LucideIcon = Sparkles;
  let title = "";
  let body = "";
  switch (insight.type) {
    case "biggest-increase":
      Icon = TrendingUp;
      title = t("insightIncreaseTitle", { category, amount });
      body = insight.merchant
        ? t("insightIncreaseBody", { merchant: insight.merchant })
        : t("insightIncreaseBodyGeneric");
      break;
    case "biggest-saving":
      Icon = PiggyBank;
      title = t("insightSavingTitle", { category, amount });
      body = t("insightSavingBody");
      break;
    case "anomaly":
      Icon = AlertTriangle;
      title = t("insightAnomalyTitle", { category, percent });
      body = t("insightAnomalyBody", { amount });
      break;
    case "over-pace":
      Icon = Gauge;
      title = t("insightOverPaceTitle");
      body = t("insightOverPaceBody", { amount });
      break;
    default:
      Icon = Sparkles;
      title = t("insightUnderPaceTitle");
      body = t("insightUnderPaceBody", { amount });
      break;
  }

  const iconClass =
    insight.tone === "positive"
      ? "text-status-on-track bg-status-on-track/10"
      : insight.tone === "warning"
        ? "text-status-over bg-status-over/10"
        : "text-muted-foreground bg-muted/60";

  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/60 p-3">
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          iconClass,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{body}</div>
      </div>
      <Link
        href="/transactions"
        className="shrink-0 self-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t("insightReview")}
      </Link>
    </li>
  );
}
