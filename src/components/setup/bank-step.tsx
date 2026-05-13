"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BANK_PROVIDERS,
  type BankKind,
  type BankProviderInfo,
} from "@/lib/types";
import {
  listIntegrations,
  saveBankCredentials,
  testBankConnection,
  getIntegrationCredentials,
  deleteIntegration,
} from "@/lib/api";
import { ProviderBadge } from "./provider-badge";

interface BankStepProps {
  onComplete: () => void;
}

export function BankStep({ onComplete }: BankStepProps) {
  const [filter, setFilter] = useState<"all" | BankKind>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: integrations = [], refetch } = useQuery({
    queryKey: ["integrations"],
    queryFn: listIntegrations,
  });

  const connectedIds = new Set(integrations.map((i) => i.provider));
  const filteredProviders = BANK_PROVIDERS.filter((p) =>
    filter === "all" ? true : p.kind === filter
  );

  const canContinue = integrations.length > 0;
  const selected = selectedId
    ? BANK_PROVIDERS.find((p) => p.id === selectedId)
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Step 1 of 3
        </div>
        <h1 className="font-serif text-4xl leading-tight">
          Connect your accounts
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Add every bank and card you want Spent to track. You can add more
          later from Settings. Credentials are encrypted and stored on this
          machine only — they never leave your computer.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-primary/10 px-4 py-3 text-xs font-medium text-primary">
        <span>🔒 End-to-end encrypted</span>
        <span className="opacity-30">·</span>
        <span>💻 Stored locally only</span>
        <span className="opacity-30">·</span>
        <span>👁️ Open source · audit the code yourself</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* LEFT - connections + picker */}
        <div className="space-y-5">
          {integrations.length > 0 && (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-bold tracking-tight">
                  Your connections{" "}
                  <span className="font-medium text-muted-foreground">
                    · {integrations.length} connected
                  </span>
                </h2>
              </div>
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {integrations.map((integ) => {
                    const info = BANK_PROVIDERS.find(
                      (p) => p.id === integ.provider
                    );
                    if (!info) return null;
                    return (
                      <motion.div
                        key={integ.provider}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="flex items-center gap-3 rounded-xl bg-card p-3"
                      >
                        <ProviderBadge
                          color={info.color}
                          name={info.name}
                          domain={info.domain}
                          size={36}
                          radius={10}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold tracking-tight">
                              {info.name}
                            </span>
                            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                              ● Ready
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {info.kind === "bank" ? "Bank" : "Credit card"} ·{" "}
                            {info.credentialFields.length} credentials
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedId(info.id)}
                          className="rounded-md px-2 py-1 text-xs font-medium hover:bg-accent"
                        >
                          Edit
                        </button>
                        <RemoveButton
                          provider={integ.provider}
                          onRemoved={() => {
                            refetch();
                            if (selectedId === integ.provider) {
                              setSelectedId(null);
                            }
                          }}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </section>
          )}

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-bold tracking-tight">
                {integrations.length === 0
                  ? "Pick an account to connect"
                  : "Add another account"}
              </h2>
              <FilterPills value={filter} onChange={setFilter} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {filteredProviders.map((p) => {
                const isConnected = connectedIds.has(p.id);
                const isSelected = selectedId === p.id;
                return (
                  <motion.button
                    key={p.id}
                    onClick={() => p.enabled && setSelectedId(p.id)}
                    disabled={!p.enabled}
                    whileHover={p.enabled ? { y: -1 } : {}}
                    whileTap={p.enabled ? { scale: 0.99 } : {}}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/40"
                    } ${!p.enabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <ProviderBadge
                      color={p.color}
                      name={p.name}
                      domain={p.domain}
                      size={34}
                      radius={10}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-bold tracking-tight">
                          {p.name}
                        </span>
                        {isConnected && (
                          <span className="text-[10px] text-primary">✓</span>
                        )}
                        {!p.enabled && (
                          <span className="rounded-full bg-muted px-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                            soon
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                        {p.blurb}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <p className="mt-3 text-[11px] italic text-muted-foreground">
              Don&apos;t see your bank? Open an issue and we&apos;ll add a
              scraper.
            </p>
          </section>
        </div>

        {/* RIGHT - dynamic panel */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
              >
                <CredentialPanel
                  info={selected}
                  isEdit={connectedIds.has(selected.id)}
                  onClose={() => setSelectedId(null)}
                  onSaved={() => {
                    refetch();
                    setSelectedId(null);
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex h-full flex-col items-center justify-center rounded-3xl bg-card p-10 text-center"
              >
                <div className="mb-4 text-4xl">🏦</div>
                <h3 className="font-serif text-2xl">
                  {canContinue ? "All set so far" : "Pick a provider"}
                </h3>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  {canContinue
                    ? "Add more accounts on the left, or continue to AI setup."
                    : "Choose a bank or card on the left to enter your credentials. The credentials never leave this machine."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <footer className="flex items-center justify-between pt-4">
        <div className="text-xs text-muted-foreground">
          {canContinue
            ? `${integrations.length} ${integrations.length === 1 ? "connection" : "connections"} ready.`
            : "Add at least one account to continue."}
        </div>
        <Button onClick={onComplete} disabled={!canContinue}>
          Continue to AI →
        </Button>
      </footer>
    </div>
  );
}

function FilterPills({
  value,
  onChange,
}: {
  value: "all" | BankKind;
  onChange: (v: "all" | BankKind) => void;
}) {
  const options: { id: "all" | BankKind; label: string }[] = [
    { id: "all", label: "All" },
    { id: "bank", label: "Banks" },
    { id: "card", label: "Cards" },
  ];
  return (
    <div className="flex gap-0.5 rounded-full border bg-card p-0.5">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CredentialPanel({
  info,
  isEdit,
  onClose,
  onSaved,
}: {
  info: BankProviderInfo;
  isEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(!isEdit);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "testing-ok" | "testing-fail" | "saved"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pre-fill on edit
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const { credentials: existing } = await getIntegrationCredentials(
          info.id
        );
        if (!cancelled && existing) setCredentials(existing);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, info.id]);

  const valid = info.credentialFields.every((f) => {
    const v = credentials[f.key]?.trim() ?? "";
    if (!v) return false;
    if (f.exactLength != null && v.length !== f.exactLength) return false;
    return true;
  });

  const handleTest = async () => {
    setTesting(true);
    setStatus("idle");
    setErrorMsg(null);
    try {
      await saveBankCredentials(info.id, credentials);
      const res = await testBankConnection(info.id);
      if (res.success) {
        setStatus("testing-ok");
      } else {
        setStatus("testing-fail");
        setErrorMsg(res.message);
      }
    } catch {
      setStatus("testing-fail");
      setErrorMsg("Connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveBankCredentials(info.id, credentials);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setStatus("saved");
      setTimeout(onSaved, 600);
    } catch {
      setStatus("testing-fail");
      setErrorMsg("Failed to save credentials.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-card p-6">
      <div className="mb-5 flex items-center gap-3">
        <ProviderBadge
          color={info.color}
          name={info.name}
          domain={info.domain}
          size={48}
          radius={14}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {info.kind === "bank" ? "Connect bank" : "Connect card"}
          </div>
          <div className="font-serif text-xl tracking-tight">{info.name}</div>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {!loaded ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading current values...
        </div>
      ) : (
        <div className="space-y-3">
          {info.credentialFields.map((field) => {
            const value = credentials[field.key] ?? "";
            const tooShort =
              field.exactLength != null &&
              value.length > 0 &&
              value.length !== field.exactLength;
            return (
              <div key={field.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor={`${info.id}-${field.key}`}>
                    {field.label}
                  </Label>
                  {field.maxLength && (
                    <span className="text-[10px] text-muted-foreground">
                      {value.length}/{field.maxLength}
                    </span>
                  )}
                </div>
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
                    if (field.exactLength)
                      next = next.slice(0, field.exactLength);
                    if (field.maxLength) next = next.slice(0, field.maxLength);
                    setCredentials((prev) => ({
                      ...prev,
                      [field.key]: next,
                    }));
                  }}
                  placeholder={field.placeholder ?? field.label}
                  className={field.numeric ? "font-mono" : undefined}
                />
                {field.hint && (
                  <p className="text-[11px] text-muted-foreground">
                    {field.hint}
                  </p>
                )}
                {tooShort && (
                  <p className="text-[11px] text-destructive">
                    Must be exactly {field.exactLength} digits.
                  </p>
                )}
              </div>
            );
          })}

          <AnimatePresence>
            {status === "testing-ok" && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary"
              >
                ✓ Connection works. Click save to finish.
              </motion.div>
            )}
            {status === "testing-fail" && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {errorMsg}
              </motion.div>
            )}
            {status === "saved" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary"
              >
                ✓ Saved
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={!valid || testing || saving}
              className="flex-1"
            >
              {testing ? "Testing..." : "Test connection"}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!valid || saving}
              className="flex-1"
            >
              {saving ? "Saving..." : isEdit ? "Save changes" : "Add"}
            </Button>
          </div>

          <div className="mt-2 flex items-start gap-2 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
            <span>🔐</span>
            <span>
              Credentials are encrypted with AES-256-GCM and stored on this
              machine only.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function RemoveButton({
  provider,
  onRemoved,
}: {
  provider: string;
  onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
      >
        Remove
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setConfirming(false)}
        className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
      >
        Cancel
      </button>
      <button
        onClick={async () => {
          setRemoving(true);
          await deleteIntegration(provider);
          setRemoving(false);
          onRemoved();
        }}
        disabled={removing}
        className="rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground"
      >
        {removing ? "..." : "Confirm"}
      </button>
    </div>
  );
}
