"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getHome } from "@/lib/api";
import { PageHeader } from "@/components/layout/app-shell";
import { SyncButton } from "@/components/dashboard/sync-button";
import { CategorizeButton } from "@/components/dashboard/categorize-button";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { ThisMonthCard } from "./this-month-card";
import { CashFlowCard } from "./cash-flow-card";
import { CategorySnapshotCard } from "./category-snapshot-card";
import { HistoricalTrendCard } from "./historical-trend-card";
import { RecentTransactionsCard } from "./recent-transactions-card";
import { TopMerchantsCard } from "./top-merchants-card";
import { NeedsAttentionCard } from "./needs-attention-card";
import { BankHealthCard } from "./bank-health-card";
import { SyncStatusPill } from "./sync-status-pill";
import { SyncFailureBanner } from "./sync-failure-banner";
import { CardError, CardSkeleton } from "./card-shell";
import type { HomePayload, HomeSection } from "@/lib/types";

const ROW_1 = "col-span-12 lg:col-span-8";
const ROW_1_SIDE = "col-span-12 md:col-span-6 lg:col-span-4";
const ROW_2 = "col-span-12 md:col-span-6 lg:col-span-7";
const ROW_2_SIDE = "col-span-12 md:col-span-6 lg:col-span-5";

export function HomePage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [autoStartSync] = useState(() => searchParams.get("sync") === "1");

  useEffect(() => {
    if (autoStartSync) {
      router.replace("/", { scroll: false });
    }
  }, [autoStartSync, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["home"],
    queryFn: getHome,
  });

  const handleSyncOrCategorizeComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["home"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["settings"] });
  }, [queryClient]);

  return (
    <>
      <PageHeader
        title="Home"
        actions={
          <>
            <SyncStatusPill
              items={data?.bankHealth ?? null}
              nextScheduledSync={data?.nextScheduledSync ?? null}
            />
            <CategorizeButton onApplied={handleSyncOrCategorizeComplete} />
            <SyncButton
              onComplete={handleSyncOrCategorizeComplete}
              autoStart={autoStartSync}
            />
          </>
        }
      />

      <div className="p-4 md:p-6 lg:p-8">
        <SyncFailureBanner
          items={data?.bankHealth ?? null}
          className="mb-4 md:mb-5 lg:mb-6"
        />
        <AINotConnectedBanner className="mb-4 md:mb-5 lg:mb-6" />
        <div className="grid grid-cols-12 gap-4 md:gap-5 lg:gap-6">
          {renderSection("thisMonth", data, isLoading, isError, ROW_1)}
          {renderSection("cashFlow", data, isLoading, isError, ROW_1_SIDE)}
          {renderSection("categorySnapshot", data, isLoading, isError, ROW_2)}
          {renderSection("historicalTrend", data, isLoading, isError, ROW_2_SIDE)}
          {renderSection("recentTransactions", data, isLoading, isError, ROW_2)}
          {renderSection("topMerchants", data, isLoading, isError, ROW_2_SIDE)}
          {renderSection("needsAttention", data, isLoading, isError, ROW_2)}
          {renderSection("bankHealth", data, isLoading, isError, ROW_2_SIDE)}
        </div>
      </div>
    </>
  );
}

function renderSection(
  section: HomeSection,
  data: HomePayload | undefined,
  isLoading: boolean,
  isError: boolean,
  spanClass: string
) {
  if (isLoading || !data) {
    return (
      <div key={section} className={spanClass}>
        <CardSkeleton label={SKELETON_LABELS[section]} height={SKELETON_HEIGHTS[section]} />
      </div>
    );
  }

  const sectionHasError =
    isError || data.errors.some((e) => e.section === section);

  if (sectionHasError) {
    return (
      <div key={section} className={spanClass}>
        <CardError label={SKELETON_LABELS[section]} />
      </div>
    );
  }

  return (
    <div key={section} className={spanClass}>
      {renderCard(section, data)}
    </div>
  );
}

function renderCard(section: HomeSection, data: HomePayload) {
  switch (section) {
    case "thisMonth":
      return data.thisMonth ? <ThisMonthCard data={data.thisMonth} /> : null;
    case "cashFlow":
      return data.cashFlow ? <CashFlowCard data={data.cashFlow} /> : null;
    case "categorySnapshot":
      return data.categorySnapshot ? (
        <CategorySnapshotCard items={data.categorySnapshot} />
      ) : null;
    case "historicalTrend":
      return data.historicalTrend ? (
        <HistoricalTrendCard data={data.historicalTrend} />
      ) : null;
    case "recentTransactions":
      return data.recentTransactions ? (
        <RecentTransactionsCard items={data.recentTransactions} />
      ) : null;
    case "topMerchants":
      return data.topMerchants ? (
        <TopMerchantsCard items={data.topMerchants} />
      ) : null;
    case "needsAttention":
      return data.needsAttention ? (
        <NeedsAttentionCard data={data.needsAttention} />
      ) : null;
    case "bankHealth":
      return data.bankHealth ? (
        <BankHealthCard items={data.bankHealth} />
      ) : null;
  }
}

const SKELETON_LABELS: Record<HomeSection, string> = {
  thisMonth: "This month",
  cashFlow: "Cash flow",
  categorySnapshot: "Top categories",
  historicalTrend: "Last 8 months",
  recentTransactions: "Recent activity",
  topMerchants: "Top merchants",
  needsAttention: "Needs attention",
  bankHealth: "Bank connections",
};

const SKELETON_HEIGHTS: Record<HomeSection, number> = {
  thisMonth: 180,
  cashFlow: 160,
  categorySnapshot: 220,
  historicalTrend: 180,
  recentTransactions: 280,
  topMerchants: 220,
  needsAttention: 160,
  bankHealth: 160,
};
