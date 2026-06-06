"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { CategoryIcon } from "@/components/category-icon";
import { Sparkline } from "@/components/charts/sparkline";
import { Link } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { Mover } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CardShell } from "./card-shell";

export function TopMovers({ movers }: { movers: Mover[] }) {
  const t = useTranslations("home");
  const tCat = useTranslations("categoriesSeeded");

  if (movers.length === 0) {
    return (
      <CardShell label={t("moversTitle")}>
        <div className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground">
          {t("moversEmpty")}
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell label={t("moversTitle")} action={t("moversVsLastMonth")}>
      <ul className="-mx-2 flex flex-col">
        {movers.map((m) => {
          const up = m.direction === "up";
          const name = translateCategoryName(m.name, tCat);
          const toneText = up ? "text-status-over" : "text-status-on-track";
          return (
            <li key={m.categoryId}>
              <Link
                href="/transactions"
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-accent/40"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${m.color}24`, color: m.color }}
                >
                  <CategoryIcon name={m.icon} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className={cn("font-medium tabular-nums", toneText)}>
                      {up ? "+" : "−"}
                      {formatCurrency(m.deltaAmount)}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {up ? t("moverMoreOn") : t("moverLessOn")}
                    </span>{" "}
                    <span className="font-medium">{name}</span>
                  </div>
                  {m.topMerchant && (
                    <div className="truncate text-xs text-muted-foreground">
                      {t("moverWhy", { merchant: m.topMerchant })}
                    </div>
                  )}
                </div>
                <Sparkline
                  data={m.trend}
                  className={cn(
                    "hidden shrink-0 sm:block",
                    up ? "text-status-over/70" : "text-status-on-track/70",
                  )}
                />
                {up ? (
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-status-over" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 shrink-0 text-status-on-track" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}
