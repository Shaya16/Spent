"use client";

import { useTranslations } from "next-intl";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { translateProviderName } from "@/lib/i18n-data";
import { BANK_PROVIDERS } from "@/lib/types";

interface TransactionSourceCellProps {
  provider: string;
  accountLabel: string | null;
}

export function getAccountDisplayLabel(
  providerName: string,
  accountLabel: string | null,
): { primary: string; secondary: string | null } {
  const labelDistinct =
    accountLabel != null &&
    accountLabel.trim() !== "" &&
    accountLabel.trim().toLowerCase() !== providerName.trim().toLowerCase();
  return {
    primary: labelDistinct ? accountLabel.trim() : providerName,
    secondary: labelDistinct ? providerName : null,
  };
}

export function TransactionSourceCell({ provider, accountLabel }: TransactionSourceCellProps) {
  const tBanks = useTranslations("banks");
  const info = BANK_PROVIDERS.find((b) => b.id === provider);
  const providerName = translateProviderName(provider, info?.name ?? provider, tBanks);

  const { primary, secondary } = getAccountDisplayLabel(providerName, accountLabel);
  const tooltip = secondary ? `${primary} · ${secondary}` : primary;

  return (
    <div className="flex min-w-0 items-center gap-2" title={tooltip}>
      {info ? (
        <ProviderBadge
          color={info.color}
          name={providerName}
          domain={info.domain}
          size={20}
          radius={6}
        />
      ) : (
        <div className="h-5 w-5 shrink-0 rounded-md bg-muted" aria-hidden />
      )}
      <div className="min-w-0">
        <div className="truncate text-sm leading-tight">{primary}</div>
        {secondary ? (
          <div className="truncate text-xs text-muted-foreground">{secondary}</div>
        ) : null}
      </div>
    </div>
  );
}
