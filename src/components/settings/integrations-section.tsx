"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listIntegrations,
  deleteIntegration,
  saveBankCredentials,
  testBankConnection,
  getIntegrationCredentials,
  startSync,
  type SyncProgressEvent,
} from "@/lib/api";
import { BANK_PROVIDERS, type BankProviderInfo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { SectionShell, SettingCard } from "./section-shell";
import { toast } from "sonner";

export function IntegrationsSection() {
  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: listIntegrations,
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const connectedProviders = new Set(integrations.map((i) => i.provider));
  const availableToAdd = BANK_PROVIDERS.filter(
    (b) => b.enabled && !connectedProviders.has(b.id)
  );

  return (
    <SectionShell
      title="Bank accounts"
      description="Spent imports transactions from these accounts. Credentials are encrypted with AES-256-GCM and never leave your machine."
    >
      {integrations.length === 0 && !adding && (
        <SettingCard>
          <div className="py-2 text-sm text-muted-foreground">
            No integrations connected yet.
          </div>
        </SettingCard>
      )}

      {integrations.map((integration) => {
        const info = BANK_PROVIDERS.find((b) => b.id === integration.provider);
        if (!info) return null;
        return (
          <IntegrationCard
            key={integration.provider}
            info={info}
            connected={integration}
            editing={editing === integration.provider}
            onEdit={() => setEditing(integration.provider)}
            onCancel={() => setEditing(null)}
            onSaved={() => setEditing(null)}
          />
        );
      })}

      {adding && (
        <IntegrationCard
          info={BANK_PROVIDERS.find((b) => b.id === adding)!}
          editing
          onCancel={() => setAdding(null)}
          onSaved={() => setAdding(null)}
        />
      )}

      {availableToAdd.length > 0 && !adding && (
        <SettingCard
          title="Add another integration"
          description="More banks coming soon."
        >
          <div className="flex flex-wrap gap-2">
            {availableToAdd.map((b) => (
              <Button
                key={b.id}
                variant="outline"
                onClick={() => setAdding(b.id)}
              >
                + {b.name}
              </Button>
            ))}
          </div>
        </SettingCard>
      )}
    </SectionShell>
  );
}

interface IntegrationCardProps {
  info: BankProviderInfo;
  connected?: {
    provider: string;
    updatedAt: string;
    lastSyncAt: string | null;
    transactionCount: number;
  };
  editing?: boolean;
  onEdit?: () => void;
  onCancel: () => void;
  onSaved: () => void;
}

function IntegrationCard({
  info,
  connected,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: IntegrationCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ProviderBadge
            color={info.color}
            name={info.name}
            domain={info.domain}
            size={44}
            radius={12}
          />
          <div>
            <h3 className="font-medium">{info.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {connected
                ? `Connected · Updated ${formatRelative(connected.updatedAt)}`
                : "Not connected"}
            </p>
            {connected && (
              <p className="mt-1 text-xs text-muted-foreground">
                {connected.transactionCount} transactions
                {connected.lastSyncAt
                  ? ` · Last sync ${formatRelative(connected.lastSyncAt)}`
                  : " · Never synced"}
              </p>
            )}
          </div>
        </div>
        {!editing && connected && (
          <div className="flex flex-wrap items-center gap-2">
            <SyncIntegrationButton provider={connected.provider} />
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <RemoveButton provider={connected.provider} />
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-4 border-t pt-4">
          <CredentialsForm
            info={info}
            isEdit={!!connected}
            onCancel={onCancel}
            onSaved={onSaved}
          />
        </div>
      )}
    </div>
  );
}

function SyncIntegrationButton({ provider }: { provider: string }) {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [stage, setStage] = useState("");

  const handleSync = () => {
    setSyncing(true);
    setStage("Connecting...");
    startSync(provider, (event: SyncProgressEvent) => {
      if (event.type === "provider-start") {
        setStage("Pulling transactions...");
      } else if (event.type === "stage") {
        const s = event.data.stage as string;
        setStage(s === "categorizing" ? "Categorizing..." : "Working...");
      } else if (event.type === "complete") {
        setSyncing(false);
        setStage("");
        const { added, updated, categorized } = event.data as {
          added: number;
          updated: number;
          categorized: number;
        };
        toast.success(
          `Sync complete: ${added} new, ${updated} updated, ${categorized} categorized`
        );
        queryClient.invalidateQueries({ queryKey: ["integrations"] });
        queryClient.invalidateQueries({ queryKey: ["summary"] });
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      } else if (event.type === "error") {
        setSyncing(false);
        setStage("");
        toast.error((event.data.message as string) ?? "Sync failed", {
          duration: Infinity,
          closeButton: true,
        });
      }
    });
  };

  if (syncing) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <svg
          className="h-3.5 w-3.5 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="animate-pulse">{stage}</span>
      </span>
    );
  }

  return (
    <Button size="sm" onClick={handleSync}>
      Sync now
    </Button>
  );
}

function CredentialsForm({
  info,
  isEdit,
  onCancel,
  onSaved,
}: {
  info: BankProviderInfo;
  isEdit: boolean;
  onCancel: () => void;
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

  // When editing, pre-fill non-password fields from the server.
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

  // All fields required. Password is pre-filled on edit so the user only
  // types what they want to change.
  const allValid = info.credentialFields.every((f) => {
    const v = credentials[f.key]?.trim() ?? "";
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
      <div className="py-6 text-sm text-muted-foreground">
        Loading current values...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {info.credentialFields.map((field) => {
        const value = credentials[field.key] ?? "";
        const tooShort =
          field.exactLength != null &&
          value.length > 0 &&
          value.length !== field.exactLength;
        const placeholder = field.placeholder ?? field.label;
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
            {hint && (
              <p className="text-xs text-muted-foreground">{hint}</p>
            )}
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
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={!allValid || testing || saving}
        >
          {testing ? "Testing..." : "Test connection"}
        </Button>
        <Button onClick={handleSave} disabled={!allValid || saving || testing}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

function RemoveButton({ provider }: { provider: string }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => deleteIntegration(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["setupStatus"] });
      toast.success("Integration removed");
    },
  });

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        Remove
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Removing..." : "Confirm remove"}
      </Button>
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
