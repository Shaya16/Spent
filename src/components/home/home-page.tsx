"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { CategorizeButton } from "@/components/dashboard/categorize-button";
import { SyncButton } from "@/components/dashboard/sync-button";
import { PageHeader } from "@/components/layout/app-shell";
import { useRouter } from "@/i18n/navigation";
import { getActivity, getHome } from "@/lib/api";
import type { HomePayload, HomeSection } from "@/lib/types";
import { BankHealthCard } from "./bank-health-card";
import { CardError, CardSkeleton } from "./card-shell";
import { CashFlowCard } from "./cash-flow-card";
import { CategorySnapshotCard } from "./category-snapshot-card";
import { HistoricalTrendCard } from "./historical-trend-card";
import { NeedsAttentionCard } from "./needs-attention-card";
import { RecentTransactionsCard } from "./recent-transactions-card";
import { SyncFailureBanner } from "./sync-failure-banner";
import { SyncStatusPill } from "./sync-status-pill";
import { ThisMonthCard } from "./this-month-card";
import { TopMerchantsCard } from "./top-merchants-card";

const ROW_1 = "col-span-12 lg:col-span-8";
const ROW_1_SIDE = "col-span-12 md:col-span-6 lg:col-span-4";
const ROW_2 = "col-span-12 md:col-span-6 lg:col-span-7";
const ROW_2_SIDE = "col-span-12 md:col-span-6 lg:col-span-5";

export function HomePage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [autoStartSync] = useState(() => searchParams.get("sync") === "1");
  const t = useTranslations("home");
  const skeletonLabels = useMemo<Record<HomeSection, string>>(
    () => ({
      thisMonth: t("thisMonthLabel", { month: "" }).trim() || t("topCategoriesTitle"),
      cashFlow: t("cashFlowTitle"),
      categorySnapshot: t("topCategoriesTitle"),
      historicalTrend: t("last8Months"),
      recentTransactions: t("recentActivity"),
      topMerchants: t("topMerchants"),
      needsAttention: t("needsAttention"),
      bankHealth: t("bankConnections"),
    }),
    [t],
  );

  useEffect(() => {
    if (autoStartSync) {
      router.replace("/", { scroll: false });
    }
  }, [autoStartSync, router]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["home"],
    queryFn: getHome,
  });

  const [activityPopoverOpen, setActivityPopoverOpen] = useState(false);
  const { data: activity } = useQuery({
    queryKey: ["activity"],
    queryFn: getActivity,
    refetchInterval: (q) => {
      const a = q.state.data;
      if (activityPopoverOpen) return 3000;
      if (a?.sync.active) return 3000;
      return 15000;
    },
    refetchIntervalInBackground: false,
  });

  const handleActivityOpenChange = useCallback(
    (open: boolean) => {
      setActivityPopoverOpen(open);
      if (open) queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
    [queryClient],
  );

  const handleSyncOrCategorizeComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["home"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
  }, [queryClient]);

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        actions={
          <>
            <SyncStatusPill
              items={data?.bankHealth ?? null}
              nextScheduledSync={data?.nextScheduledSync ?? null}
              activity={activity ?? null}
              onOpenChange={handleActivityOpenChange}
            />
            <CategorizeButton onApplied={handleSyncOrCategorizeComplete} />
            <SyncButton onComplete={handleSyncOrCategorizeComplete} autoStart={autoStartSync} />
          </>
        }
      />

      <div className="p-4 md:p-6 lg:p-8">
        <SyncFailureBanner items={data?.bankHealth ?? null} className="mb-4 md:mb-5 lg:mb-6" />
        <AINotConnectedBanner className="mb-4 md:mb-5 lg:mb-6" />
        <div className="grid grid-cols-12 gap-4 md:gap-5 lg:gap-6">
          {renderSection("thisMonth", data, isLoading, isError, ROW_1, skeletonLabels, refetch)}
          {renderSection("cashFlow", data, isLoading, isError, ROW_1_SIDE, skeletonLabels, refetch)}
          {renderSection(
            "categorySnapshot",
            data,
            isLoading,
            isError,
            ROW_2,
            skeletonLabels,
            refetch,
          )}
          {renderSection(
            "historicalTrend",
            data,
            isLoading,
            isError,
            ROW_2_SIDE,
            skeletonLabels,
            refetch,
          )}
          {renderSection(
            "recentTransactions",
            data,
            isLoading,
            isError,
            ROW_2,
            skeletonLabels,
            refetch,
          )}
          {renderSection(
            "topMerchants",
            data,
            isLoading,
            isError,
            ROW_2_SIDE,
            skeletonLabels,
            refetch,
          )}
          {renderSection(
            "needsAttention",
            data,
            isLoading,
            isError,
            ROW_2,
            skeletonLabels,
            refetch,
          )}
          {renderSection(
            "bankHealth",
            data,
            isLoading,
            isError,
            ROW_2_SIDE,
            skeletonLabels,
            refetch,
          )}
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
  spanClass: string,
  skeletonLabels: Record<HomeSection, string>,
  onRetry: () => void,
) {
  if (isLoading || !data) {
    return (
      <div key={section} className={spanClass}>
        <CardSkeleton label={skeletonLabels[section]} height={SKELETON_HEIGHTS[section]} />
      </div>
    );
  }

  const sectionHasError = isError || data.errors.some((e) => e.section === section);

  if (sectionHasError) {
    return (
      <div key={section} className={spanClass}>
        <CardError label={skeletonLabels[section]} onRetry={onRetry} />
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
      return data.categorySnapshot ? <CategorySnapshotCard items={data.categorySnapshot} /> : null;
    case "historicalTrend":
      return data.historicalTrend ? <HistoricalTrendCard data={data.historicalTrend} /> : null;
    case "recentTransactions":
      return data.recentTransactions ? (
        <RecentTransactionsCard items={data.recentTransactions} />
      ) : null;
    case "topMerchants":
      return data.topMerchants ? <TopMerchantsCard items={data.topMerchants} /> : null;
    case "needsAttention":
      return data.needsAttention ? <NeedsAttentionCard data={data.needsAttention} /> : null;
    case "bankHealth":
      return data.bankHealth ? <BankHealthCard items={data.bankHealth} /> : null;
  }
}

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
