"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Plus,
  RefreshCw,
  Loader2,
  CircleCheck,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { SectionShell } from "@/components/settings/section-shell";
import { BankDetailSheet } from "@/components/settings/bank-detail-sheet";
import { useBankSync } from "@/components/settings/use-bank-sync";
import { listIntegrations } from "@/lib/api";
import { BANK_PROVIDERS } from "@/lib/types";

interface SheetState {
  open: boolean;
  mode: "edit" | "add";
  providerId: string | null;
}

export default function BankSettingsPage() {
  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: listIntegrations,
  });
  const { start, stateFor, anySyncing } = useBankSync();
  const [sheet, setSheet] = useState<SheetState>({
    open: false,
    mode: "edit",
    providerId: null,
  });

  const lastSync = useMemo(() => {
    const stamps = integrations
      .map((i) => i.lastSyncAt)
      .filter((s): s is string => Boolean(s));
    if (stamps.length === 0) return null;
    return stamps.sort().slice(-1)[0];
  }, [integrations]);

  const connectedProviders = new Set(integrations.map((i) => i.provider));
  const availableToAdd = BANK_PROVIDERS.filter(
    (b) => b.enabled && !connectedProviders.has(b.id)
  );

  const handleSyncAll = () => {
    integrations.forEach((i) => start(i.provider));
  };

  const sheetIntegration =
    sheet.mode === "edit" && sheet.providerId
      ? integrations.find((i) => i.provider === sheet.providerId) ?? null
      : null;

  return (
    <>
      <SectionShell
        title="Bank accounts"
        description="Connected institutions. Credentials are encrypted with AES-256-GCM and never leave your machine."
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {integrations.length}{" "}
            {integrations.length === 1 ? "bank" : "banks"} connected
            {lastSync ? (
              <>
                {" "}
                · Last sync{" "}
                <span className="text-foreground/80">
                  {formatRelative(lastSync)}
                </span>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncAll}
              disabled={integrations.length === 0 || anySyncing}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {anySyncing ? "Syncing…" : "Sync all"}
            </Button>
            {availableToAdd.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button size="sm" className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      Add bank
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-56">
                  {availableToAdd.map((b) => (
                    <DropdownMenuItem
                      key={b.id}
                      onClick={() =>
                        setSheet({
                          open: true,
                          mode: "add",
                          providerId: b.id,
                        })
                      }
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: b.color }}
                        />
                        {b.name}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        {integrations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No banks connected yet. Click <b>Add bank</b> to connect one.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <ul className="divide-y divide-border/60">
              {integrations.map((integration) => {
                const info = BANK_PROVIDERS.find(
                  (b) => b.id === integration.provider
                );
                if (!info) return null;
                const sync = stateFor(integration.provider);
                const openSheet = () =>
                  setSheet({
                    open: true,
                    mode: "edit",
                    providerId: integration.provider,
                  });
                return (
                  <li
                    key={integration.provider}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <button
                      type="button"
                      onClick={openSheet}
                      aria-label={`Open ${info.name} details`}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <ProviderBadge
                        color={info.color}
                        name={info.name}
                        domain={info.domain}
                        size={36}
                        radius={9}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {info.name}
                          <StatusPill
                            lastSyncAt={integration.lastSyncAt}
                            syncing={sync.syncing}
                          />
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {integration.transactionCount} transactions
                          {integration.lastSyncAt
                            ? ` · last sync ${formatRelative(integration.lastSyncAt)}`
                            : " · never synced"}
                        </div>
                      </div>
                    </button>
                    <SyncButton
                      syncing={sync.syncing}
                      stage={sync.stage}
                      onClick={() => start(integration.provider)}
                    />
                    <button
                      type="button"
                      onClick={openSheet}
                      aria-label={`Open ${info.name} details`}
                      className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </SectionShell>

      <BankDetailSheet
        open={sheet.open}
        mode={sheet.mode}
        providerId={sheet.providerId}
        connected={sheetIntegration}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </>
  );
}

function StatusPill({
  lastSyncAt,
  syncing,
}: {
  lastSyncAt: string | null;
  syncing: boolean;
}) {
  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Syncing
      </span>
    );
  }
  if (!lastSyncAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
        <CircleAlert className="h-3 w-3" /> Never synced
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
      <CircleCheck className="h-3 w-3" /> Connected
    </span>
  );
}

function SyncButton({
  syncing,
  stage,
  onClick,
}: {
  syncing: boolean;
  stage: string;
  onClick: () => void;
}) {
  if (syncing) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="hidden sm:inline">{stage || "Syncing…"}</span>
      </span>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0 gap-1.5"
      onClick={onClick}
    >
      <RefreshCw className="h-3.5 w-3.5" />
      Sync
    </Button>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso.replace(" ", "T") + "Z");
  const diffSec = (Date.now() - then.getTime()) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.round(diffSec / 86400)}d ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
