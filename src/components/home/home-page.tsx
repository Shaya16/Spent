"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { CategorizeButton } from "@/components/dashboard/categorize-button";
import { SyncButton } from "@/components/dashboard/sync-button";
import { PageHeader } from "@/components/layout/app-shell";
import { useRouter } from "@/i18n/navigation";
import { getActivity, getInsights } from "@/lib/api";
import { AttentionStrip } from "./attention-strip";
import { BreakdownSection } from "./breakdown-section";
import { CardError, CardSkeleton } from "./card-shell";
import { ImproveFeed } from "./improve-feed";
import { RecentActivity } from "./recent-activity";
import { SyncFailureBanner } from "./sync-failure-banner";
import { SyncStatusPill } from "./sync-status-pill";
import { TopMovers } from "./top-movers";
import { VerdictHero } from "./verdict-hero";

export function HomePage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [autoStartSync] = useState(() => searchParams.get("sync") === "1");
  const t = useTranslations("home");

  useEffect(() => {
    if (autoStartSync) router.replace("/", { scroll: false });
  }, [autoStartSync, router]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["insights"],
    queryFn: getInsights,
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
    queryClient.invalidateQueries({ queryKey: ["insights"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
  }, [queryClient]);

  const loading = isLoading || !data;

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

        <div className="flex flex-col gap-4 md:gap-5 lg:gap-6">
          {loading ? (
            <CardSkeleton height={220} />
          ) : isError || !data.verdict ? (
            <CardError label={t("pageTitle")} onRetry={refetch} />
          ) : (
            <VerdictHero verdict={data.verdict} cashFlow={data.cashFlow} burndown={data.burndown} />
          )}

          {!loading && !isError && data.needsAttention && (
            <AttentionStrip data={data.needsAttention} />
          )}

          <div className="grid grid-cols-12 gap-4 md:gap-5 lg:gap-6">
            <div className="col-span-12 lg:col-span-6">
              {loading ? (
                <CardSkeleton label={t("moversTitle")} height={260} />
              ) : data.movers ? (
                <TopMovers movers={data.movers} />
              ) : (
                <CardError label={t("moversTitle")} onRetry={refetch} />
              )}
            </div>
            <div className="col-span-12 lg:col-span-6">
              {loading ? (
                <CardSkeleton label={t("improveTitle")} height={260} />
              ) : data.insights ? (
                <ImproveFeed insights={data.insights} />
              ) : (
                <CardError label={t("improveTitle")} onRetry={refetch} />
              )}
            </div>
            <div className="col-span-12 lg:col-span-7">
              {loading ? (
                <CardSkeleton label={t("breakdownTitle")} height={260} />
              ) : data.breakdown ? (
                <BreakdownSection items={data.breakdown} />
              ) : (
                <CardError label={t("breakdownTitle")} onRetry={refetch} />
              )}
            </div>
            <div className="col-span-12 lg:col-span-5">
              {loading ? (
                <CardSkeleton label={t("recentActivity")} height={260} />
              ) : data.recentTransactions ? (
                <RecentActivity items={data.recentTransactions} />
              ) : (
                <CardError label={t("recentActivity")} onRetry={refetch} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
