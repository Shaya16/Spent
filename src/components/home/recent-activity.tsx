"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { HomeRecentTransaction } from "@/lib/types";
import { CardAction, CardShell } from "./card-shell";

export function RecentActivity({ items }: { items: HomeRecentTransaction[] }) {
  const t = useTranslations("home");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale() as Locale;

  if (items.length === 0) {
    return (
      <CardShell label={t("recentActivity")}>
        <div className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted-foreground">
          {t("noTransactionsYet")}
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      label={t("recentActivity")}
      action={<CardAction href="/transactions">{t("allTransactions")}</CardAction>}
    >
      <ul className="-mx-2 divide-y divide-border/60">
        {items.map((txn) => (
          <li key={txn.id}>
            <Link
              href="/transactions"
              className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40"
            >
              <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatDayMonth(txn.date)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{txn.description}</div>
                {txn.categoryName ? (
                  <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    {txn.categoryColor && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: txn.categoryColor }}
                      />
                    )}
                    <span className="truncate">
                      {translateCategoryName(txn.categoryName, tCat)}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("uncategorized")}</span>
                )}
              </div>
              <span
                className={`shrink-0 text-sm tabular-nums ${
                  txn.kind === "income" ? "text-status-on-track" : "text-foreground"
                }`}
              >
                {txn.kind === "income" ? "+" : "−"}
                {formatCurrency(txn.chargedAmount, txn.chargedCurrency ?? "ILS", locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function formatDayMonth(iso: string): string {
  const parts = formatDate(iso).split("/");
  return `${parts[0]}/${parts[1]}`;
}
