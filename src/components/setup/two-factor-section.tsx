"use client";

import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
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
  const supportsProgrammatic = Boolean(info.supportsProgrammaticTwoFactor);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        Two-factor authentication
      </div>

      {supportsProgrammatic ? (
        <p className="text-xs text-muted-foreground">
          {info.name} sends a one-time SMS code on first sync. Spent will save a
          long-term token so future syncs don&apos;t need a fresh code.
          {hasTwoFactorToken && " You already have a saved token."}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          If you have 2FA enabled on {info.name}, turn this on so Spent opens a
          browser window when syncing this account. Solve the challenge in the
          popup and the sync will continue.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor={`${info.id}-manual-2fa`}
          className="text-sm font-medium"
        >
          This account requires 2FA
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
          Not needed for {info.name} — 2FA is handled programmatically.
        </p>
      ) : null}

      {showResetButton && supportsProgrammatic && hasTwoFactorToken ? (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <div>
            <div className="text-sm font-medium">Saved 2FA token</div>
            <div className="text-[11px] text-muted-foreground">
              Removing it forces a fresh SMS code on the next sync.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onResetToken}
            disabled={resetPending}
          >
            {resetPending ? "Resetting…" : "Reset 2FA"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
