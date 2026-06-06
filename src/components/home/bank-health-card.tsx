"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatLastSync } from "@/lib/formatters";
import { translateProviderName, useFormatterLabels } from "@/lib/i18n-data";
import type { HomeBankHealthItem } from "@/lib/types";
import { CardAction, CardShell } from "./card-shell";

interface Props {
  items: HomeBankHealthItem[];
}

export function BankHealthCard({ items }: Props) {
  const t = useTranslations("home");
  if (items.length === 0) {
    return (
      <div id="bank-health" className="contents">
        <CardShell
          label={t("bankConnections")}
          action={<CardAction href="/settings/bank">{t("manage")}</CardAction>}
        >
          <div className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground">
            {t("noBanksConnectedYet")}
          </div>
        </CardShell>
      </div>
    );
  }

  return (
    <div id="bank-health" className="contents">
      <CardShell
        label={t("bankConnections")}
        action={<CardAction href="/settings/bank">{t("manage")}</CardAction>}
      >
        <ul className="flex flex-1 flex-col gap-3">
          {items.map((item) => (
            <li key={item.provider}>
              <Row item={item} />
            </li>
          ))}
        </ul>
      </CardShell>
    </div>
  );
}

function Row({ item }: { item: HomeBankHealthItem }) {
  const t = useTranslations("home");
  const tBanks = useTranslations("banks");
  const labels = useFormatterLabels();
  const { providerName, lastSyncAt, status, errorMessage, provider } = item;
  const displayName = translateProviderName(provider, providerName, tBanks);

  return (
    <Link
      href="/settings/bank"
      className="flex items-center justify-between rounded-xl px-2 py-1.5 transition-colors hover:bg-accent/40"
      title={errorMessage ?? undefined}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot status={status} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{displayName}</div>
          <div className="text-xs text-muted-foreground">
            {describeLastSync(lastSyncAt, status, labels, t)}
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
  const t = useTranslations("home");
  const text =
    status === "ok"
      ? t("statusOk")
      : status === "stale"
        ? t("statusStale")
        : status === "error"
          ? t("statusError")
          : t("statusNeverSynced");
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

function describeLastSync(
  iso: string | null,
  status: HomeBankHealthItem["status"],
  labels: ReturnType<typeof useFormatterLabels>,
  t: ReturnType<typeof useTranslations<"home">>,
): string {
  if (!iso) return status === "error" ? t("lastAttemptFailed") : t("statusNeverSynced");
  return formatLastSync(iso, labels);
}
