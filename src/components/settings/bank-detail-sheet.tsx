"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { BANK_PROVIDERS, type BankProviderInfo } from "@/lib/types";
import {
  deleteIntegration,
  getIntegrationCredentials,
  saveBankCredentials,
  testBankConnection,
} from "@/lib/api";
import { useBankSync } from "@/components/settings/use-bank-sync";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";

export interface BankDetailSheetProps {
  open: boolean;
  mode: "edit" | "add";
  providerId: string | null;
  connected?: {
    provider: string;
    updatedAt: string;
    lastSyncAt: string | null;
    transactionCount: number;
  } | null;
  onClose: () => void;
}

export function BankDetailSheet({
  open,
  mode,
  providerId,
  connected,
  onClose,
}: BankDetailSheetProps) {
  const info = providerId
    ? BANK_PROVIDERS.find((b) => b.id === providerId) ?? null
    : null;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-md! md:max-w-lg!"
      >
        {info ? (
          <SheetBody
            info={info}
            mode={mode}
            connected={connected ?? null}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({
  info,
  mode,
  connected,
  onClose,
}: {
  info: BankProviderInfo;
  mode: "edit" | "add";
  connected: BankDetailSheetProps["connected"];
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader className="gap-3 border-b border-border/40 p-6">
        <div className="flex items-center gap-3">
          <ProviderBadge
            color={info.color}
            name={info.name}
            domain={info.domain}
            size={40}
            radius={10}
          />
          <div className="min-w-0 flex-1">
            <SheetTitle>{info.name}</SheetTitle>
            <SheetDescription className="mt-0.5">
              {mode === "add"
                ? "Connect this bank to sync transactions."
                : connected
                  ? `Connected · ${connected.transactionCount} transactions`
                  : info.blurb}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 p-6">
        <CredentialsForm
          info={info}
          isEdit={mode === "edit"}
          onSaved={onClose}
        />
        {mode === "edit" && connected ? (
          <RecentSyncCard
            provider={connected.provider}
            lastSyncAt={connected.lastSyncAt}
            transactionCount={connected.transactionCount}
          />
        ) : null}
      </div>

      {mode === "edit" && connected ? (
        <div className="border-t border-border/40 p-6">
          <DangerZone provider={connected.provider} onRemoved={onClose} />
        </div>
      ) : null}
    </div>
  );
}

function CredentialsForm({
  info,
  isEdit,
  onSaved,
}: {
  info: BankProviderInfo;
  isEdit: boolean;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(!isEdit);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const { credentials: existing } = await getIntegrationCredentials(
          info.id
        );
        if (cancelled) return;
        if (existing) setCredentials(existing);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, info.id]);

  const allValid = info.credentialFields.every((f) => {
    const v = credentials[f.key]?.trim() ?? "";
    // In edit mode, blank password fields are intentional: blank = keep existing.
    if (!v && isEdit && f.type === "password") return true;
    if (!v) return false;
    if (f.exactLength != null && v.length !== f.exactLength) return false;
    return true;
  });

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      await saveBankCredentials(info.id, credentials);
      const res = await testBankConnection(info.id);
      setResult(res);
    } catch {
      setResult({ success: false, message: "Connection test failed." });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveBankCredentials(info.id, credentials);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["setupStatus"] });
      toast.success(`${info.name} credentials saved`);
      onSaved();
    } catch {
      setResult({ success: false, message: "Failed to save credentials." });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading current values…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Credentials
      </div>
      {info.credentialFields.map((field) => {
        const value = credentials[field.key] ?? "";
        const tooShort =
          field.exactLength != null &&
          value.length > 0 &&
          value.length !== field.exactLength;
        const placeholder =
          isEdit && field.type === "password"
            ? "Leave blank to keep current"
            : (field.placeholder ?? field.label);
        const hint = field.hint;
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`${info.id}-${field.key}`}>{field.label}</Label>
            <Input
              id={`${info.id}-${field.key}`}
              type={field.type}
              inputMode={field.numeric ? "numeric" : undefined}
              pattern={field.numeric ? "[0-9]*" : undefined}
              maxLength={field.maxLength ?? field.exactLength ?? undefined}
              value={value}
              onChange={(e) => {
                let next = e.target.value;
                if (field.numeric) next = next.replace(/\D/g, "");
                if (field.exactLength) next = next.slice(0, field.exactLength);
                if (field.maxLength) next = next.slice(0, field.maxLength);
                setCredentials((prev) => ({ ...prev, [field.key]: next }));
              }}
              placeholder={placeholder}
              aria-invalid={tooShort || undefined}
            />
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            {tooShort && (
              <p className="text-xs text-destructive">
                Must be exactly {field.exactLength} digits.
              </p>
            )}
          </div>
        );
      })}

      {result && (
        <div
          className={`rounded-md p-3 text-sm ${
            result.success
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {result.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={!allValid || testing || saving}
        >
          {testing ? "Testing…" : "Test connection"}
        </Button>
        <Button onClick={handleSave} disabled={!allValid || saving || testing}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function RecentSyncCard({
  lastSyncAt,
  transactionCount,
}: {
  provider: string;
  lastSyncAt: string | null;
  transactionCount: number;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Recent sync
      </div>
      <div className="mt-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
        <div className="font-medium">
          {transactionCount} transaction{transactionCount === 1 ? "" : "s"}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {lastSyncAt
            ? `Last synced ${formatRelative(lastSyncAt)}`
            : "Never synced"}
        </div>
      </div>
    </div>
  );
}

function DangerZone({
  provider,
  onRemoved,
}: {
  provider: string;
  onRemoved: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => deleteIntegration(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["setupStatus"] });
      toast.success("Bank disconnected");
      onRemoved();
    },
  });

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Disconnect this bank</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Removes credentials. Existing transactions stay.
          </p>
          {!confirming ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5 text-destructive hover:text-destructive"
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Disconnect
            </Button>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Disconnecting…" : "Confirm disconnect"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
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
