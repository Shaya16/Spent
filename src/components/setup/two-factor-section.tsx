"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { BankProviderInfo } from "@/lib/types";

interface TwoFactorSectionProps {
  info: BankProviderInfo;
  requiresManualTwoFactor: boolean;
  hasTwoFactorToken?: boolean;
  onChangeManualFlag: (next: boolean) => void;
  onResetToken?: () => void;
  resetPending?: boolean;
  /**
   * When true, render the "Reset 2FA" button. Only meaningful for
   * programmatic-2FA banks (OneZero today).
   */
  showResetButton?: boolean;
}

export function TwoFactorSection({
  info,
  requiresManualTwoFactor,
  hasTwoFactorToken = false,
  onChangeManualFlag,
  onResetToken,
  resetPending = false,
  showResetButton = false,
}: TwoFactorSectionProps) {
  const t = useTranslations("setup");
  const supportsProgrammatic = Boolean(info.supportsProgrammaticTwoFactor);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        {t("twoFaTitle")}
      </div>

      {supportsProgrammatic ? (
        <p className="text-xs text-muted-foreground">
          {t("twoFaProgrammaticHint", { bank: info.name })}
          {hasTwoFactorToken && ` ${t("twoFaProgrammaticHintHasToken")}`}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("twoFaManualHint", { bank: info.name })}</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${info.id}-manual-2fa`} className="text-sm font-medium">
          {t("twoFaAccountRequires")}
        </Label>
        <Switch
          id={`${info.id}-manual-2fa`}
          checked={requiresManualTwoFactor}
          onCheckedChange={onChangeManualFlag}
          disabled={supportsProgrammatic}
        />
      </div>
      {supportsProgrammatic ? (
        <p className="text-[11px] text-muted-foreground">
          {t("twoFaProgrammaticNote", { bank: info.name })}
        </p>
      ) : null}

      {showResetButton && supportsProgrammatic && hasTwoFactorToken ? (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <div>
            <div className="text-sm font-medium">{t("twoFaSavedTokenTitle")}</div>
            <div className="text-[11px] text-muted-foreground">{t("twoFaSavedTokenHint")}</div>
          </div>
          <Button variant="outline" size="sm" onClick={onResetToken} disabled={resetPending}>
            {resetPending ? t("twoFaResetting") : t("twoFaResetButton")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
