"use client";

import { useLocale, useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/formatters";
import { translateCategoryName } from "@/lib/i18n-data";
import type { DashboardSummary } from "@/lib/types";

interface HeroCardProps {
  data: DashboardSummary | undefined;
  loading: boolean;
  monthLabel: string;
}

type PaceVerdict = "overBudget" | "headsUp" | "wellUnder" | "ahead" | "onSchedule" | "noBudget";

function computeVerdict(
  budgetedSpent: number,
  totalBudget: number,
  timeElapsedPercent: number,
): PaceVerdict {
  if (totalBudget <= 0) return "noBudget";
  const pctSpent = (budgetedSpent / totalBudget) * 100;
  if (pctSpent > 100) return "overBudget";
  const delta = pctSpent - timeElapsedPercent;
  if (delta >= 25) return "headsUp";
  if (delta <= -25) return "wellUnder";
  if (delta <= -10) return "ahead";
  return "onSchedule";
}

export function HeroCard({ data, loading, monthLabel }: HeroCardProps) {
  const t = useTranslations("dashboard");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale() as Locale;

  if (loading || !data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const {
    periodTotal,
    budgetedSpent,
    totalBudget,
    timeElapsedPercent,
    daysUntilPayday,
    todayLabel,
    categoriesWithData,
    typicalMonthly,
  } = data;
  const hasBudget = totalBudget > 0;

  const parentIdsWithRollup = new Set<number>();
  for (const c of categoriesWithData) {
    if (c.isParent) parentIdsWithRollup.add(c.categoryId);
  }
  const sorted = [...categoriesWithData]
    .filter(
      (c) =>
        c.spent > 0 && (c.isParent || c.parentId == null || !parentIdsWithRollup.has(c.parentId)),
    )
    .sort((a, b) => b.spent - a.spent);
  const topFour = sorted.slice(0, 4);
  const rest = sorted.slice(4);
  const restTotal = rest.reduce((sum, c) => sum + c.spent, 0);
  const grandTotal = sorted.reduce((sum, c) => sum + c.spent, 0);

  const legend = [
    ...topFour.map((c) => ({
      name: translateCategoryName(c.categoryName, tCat),
      color: c.categoryColor,
      amount: c.spent,
      pct: grandTotal > 0 ? (c.spent / grandTotal) * 100 : 0,
    })),
    ...(rest.length > 0
      ? [
          {
            name: t("moreCategories", { count: rest.length }),
            color: "var(--muted-foreground)",
            amount: restTotal,
            pct: grandTotal > 0 ? (restTotal / grandTotal) * 100 : 0,
          },
        ]
      : []),
  ];

  const verdict = computeVerdict(budgetedSpent, totalBudget, timeElapsedPercent);
  const todayPhrase = useTodayPhrase(todayLabel, locale);

  const ctaLabel = typicalMonthly
    ? t("setMonthlyTargetWithTypical", {
        amount: formatCurrency(typicalMonthly, "ILS", locale),
      })
    : t("setMonthlyTarget");

  const body = (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {todayPhrase}
        {" · "}
        {t("youHavePaydayPrefix")}{" "}
        <span className="font-medium text-foreground">
          {daysUntilPayday} {daysUntilPayday === 1 ? t("daysOne") : t("daysOther")}
        </span>{" "}
        {t("untilPayday")}
      </p>
      <h2 className="font-serif text-3xl leading-[1.05] tracking-tighter md:text-4xl lg:text-5xl">
        <HeroPhrase
          hasBudget={hasBudget}
          verdict={verdict}
          monthLabel={monthLabel}
          displaySpent={hasBudget ? budgetedSpent : periodTotal}
          totalBudget={totalBudget}
          locale={locale}
        />
      </h2>
      {legend.length > 0 && (
        <div className="space-y-3 pt-2">
          <StackedBar legend={legend} />
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {legend.map((seg) => (
              <div key={seg.name} className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
                <span className="font-medium">{seg.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCurrency(seg.amount, "ILS", locale)} {"·"} {Math.round(seg.pct)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!hasBudget && (
        <div className="pt-1">
          <Link
            href="/settings/general#section-monthly-target"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {ctaLabel}
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 md:p-8 lg:p-10">
      {hasBudget ? (
        <div className="grid gap-6 md:grid-cols-[200px_1fr] md:gap-10 lg:grid-cols-[240px_1fr]">
          <div className="flex flex-col items-center justify-center gap-2">
            <PaceGauge
              periodTotal={periodTotal}
              budgetedSpent={budgetedSpent}
              totalBudget={totalBudget}
              timeElapsedPercent={timeElapsedPercent}
              verdict={verdict}
              locale={locale}
            />
          </div>
          {body}
        </div>
      ) : (
        body
      )}
    </div>
  );
}

// Built once at module scope: rebuilding Intl formatters per render loads
// locale-data tables and is wasteful. This helper runs after an early return
// in HeroCard, so useMemo is not an option (it would break the Rules of Hooks).
const TODAY_FORMAT_HE = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  month: "long",
  day: "numeric",
});
const TODAY_FORMAT_EN = new Intl.DateTimeFormat("en-IL", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function useTodayPhrase(serverLabel: string, locale: Locale): string {
  // Re-format today's date in the current locale so Hebrew users see Hebrew.
  // The server passed a snapshot, but we re-derive from `new Date()` for the locale.
  try {
    return (locale === "he" ? TODAY_FORMAT_HE : TODAY_FORMAT_EN).format(new Date());
  } catch {
    return serverLabel;
  }
}

function HeroPhrase({
  hasBudget,
  verdict,
  monthLabel,
  displaySpent,
  totalBudget,
  locale,
}: {
  hasBudget: boolean;
  verdict: PaceVerdict;
  monthLabel: string;
  displaySpent: number;
  totalBudget: number;
  locale: Locale;
}) {
  const t = useTranslations("dashboard");
  const amount = formatCurrency(displaySpent, "ILS", locale);
  const budget = formatCurrency(totalBudget, "ILS", locale);

  if (!hasBudget) {
    return <span>{t("phraseSpentThis", { amount, month: monthLabel })}</span>;
  }

  const lead = t("phraseLead", { amount, budget, month: monthLabel });
  const tail =
    verdict === "overBudget"
      ? t("phraseOver")
      : verdict === "headsUp"
        ? t("phraseHeadsUp")
        : verdict === "wellUnder"
          ? t("phraseWellUnder")
          : verdict === "ahead"
            ? t("phraseAhead")
            : t("phraseOnSchedule");

  const toneWord =
    verdict === "overBudget"
      ? t("wordOverBudget")
      : verdict === "headsUp"
        ? t("wordOverSchedule")
        : verdict === "wellUnder"
          ? t("wordWellUnder")
          : verdict === "ahead"
            ? t("wordAhead")
            : t("wordOnSchedule");

  const toneClass =
    verdict === "overBudget" || verdict === "headsUp" ? "text-status-over" : "text-status-on-track";

  const leadParts = lead.split(amount);
  const renderLead =
    leadParts.length === 2 ? (
      <>
        {leadParts[0]}
        <span className="text-status-on-track">{amount}</span>
        {leadParts[1]}
      </>
    ) : (
      lead
    );

  const tailParts = tail.split(toneWord);
  const renderTail =
    tailParts.length === 2 ? (
      <>
        {tailParts[0]}
        <span className={toneClass}>{toneWord}</span>
        {tailParts[1]}
      </>
    ) : (
      tail
    );

  return (
    <>
      {renderLead}
      {renderTail}
    </>
  );
}

function PaceGauge({
  periodTotal,
  budgetedSpent,
  totalBudget,
  timeElapsedPercent,
  verdict,
  locale,
}: {
  periodTotal: number;
  budgetedSpent: number;
  totalBudget: number;
  timeElapsedPercent: number;
  verdict: PaceVerdict;
  locale: Locale;
}) {
  const t = useTranslations("dashboard");
  const size = 200;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;
  const hasBudget = totalBudget > 0;

  const fillPercent = hasBudget
    ? Math.min(100, Math.max(0, (budgetedSpent / totalBudget) * 100))
    : 0;
  const dash = (fillPercent / 100) * circumference;

  const pctSpent = hasBudget ? (budgetedSpent / totalBudget) * 100 : 0;
  const delta = pctSpent - timeElapsedPercent;
  const scheduleTarget = totalBudget * (timeElapsedPercent / 100);
  const scheduleGap = budgetedSpent - scheduleTarget;
  const overBudgetBy = Math.round(Math.max(0, budgetedSpent - totalBudget));

  const isOverBudget = pctSpent > 100;
  const isOver = isOverBudget || delta >= 25;
  const isAhead = delta <= -10;
  const ringColor = isOver ? "var(--status-over)" : "var(--status-on-track)";
  const verdictClass = isOver ? "text-status-over" : "text-status-on-track";

  let verdictText: string;
  if (!hasBudget) {
    verdictText = t("verdictSpentThisMonth");
  } else if (isOverBudget) {
    verdictText = t("verdictOverBudgetBy", {
      amount: formatCurrency(overBudgetBy, "ILS", locale),
    });
  } else if (delta >= 25) {
    verdictText = t("verdictOverSchedule", {
      amount: formatCurrency(Math.abs(scheduleGap), "ILS", locale),
    });
  } else if (isAhead) {
    verdictText = t("verdictAheadOfSchedule", {
      amount: formatCurrency(Math.abs(scheduleGap), "ILS", locale),
    });
  } else {
    verdictText = t("verdictOnSchedule");
  }

  const notchAngle = (timeElapsedPercent / 100) * 2 * Math.PI;
  const cosA = Math.cos(notchAngle);
  const sinA = Math.sin(notchAngle);
  const notchInnerR = radius - stroke / 2 - 2;
  const notchOuterR = radius + stroke / 2 + 2;
  const notchX1 = cx + notchInnerR * cosA;
  const notchY1 = cy + notchInnerR * sinA;
  const notchX2 = cx + notchOuterR * cosA;
  const notchY2 = cy + notchOuterR * sinA;

  void verdict;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        {hasBudget && (
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
          />
        )}
        {hasBudget && (
          <line
            x1={notchX1}
            y1={notchY1}
            x2={notchX2}
            y2={notchY2}
            stroke="var(--foreground)"
            strokeOpacity={0.85}
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <div className="font-serif text-3xl tabular-nums">
          {formatCurrency(hasBudget ? budgetedSpent : periodTotal, "ILS", locale)}
        </div>
        {hasBudget && (
          <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {t("ofBudget", { amount: formatCurrency(totalBudget, "ILS", locale) })}
          </div>
        )}
        <div className={`mt-1 text-xs ${hasBudget ? verdictClass : "text-muted-foreground"}`}>
          {verdictText}
        </div>
      </div>
    </div>
  );
}

function StackedBar({ legend }: { legend: { name: string; color: string; pct: number }[] }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {legend.map((seg, i) => (
        <div key={i} style={{ width: `${seg.pct}%`, backgroundColor: seg.color }} />
      ))}
    </div>
  );
}
