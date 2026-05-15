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

type Sub = "pick" | "form" | "ready";

const NUMBER_WORDS: Record<number, string> = {
  1: "One",
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
  6: "Six",
  7: "Seven",
  8: "Eight",
  9: "Nine",
  10: "Ten",
};

interface BankStepProps {
  onComplete: () => void;
}

export function BankStep({ onComplete }: BankStepProps) {
  const [filter, setFilter] = useState<"all" | BankKind>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);

  const { data: integrations = [], isPending, refetch } = useQuery({
    queryKey: ["integrations"],
    queryFn: listIntegrations,
  });

  // Pick the right starting view once we've heard back from the query
  useEffect(() => {
    if (isPending || sub != null) return;
    setSub(integrations.length > 0 ? "ready" : "pick");
  }, [isPending, integrations.length, sub]);

  const connectedIds = new Set(integrations.map((i) => i.provider));
  const selected = selectedId
    ? (BANK_PROVIDERS.find((p) => p.id === selectedId) ?? null)
    : null;

  const filteredProviders = BANK_PROVIDERS.filter((p) => {
    if (filter !== "all" && p.kind !== filter) return false;
    if (
      search &&
      !p.name.toLowerCase().includes(search.toLowerCase()) &&
      !p.blurb.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  function handlePick(id: string) {
    setSelectedId(id);
    setSub("form");
  }

  function handleCloseForm() {
    setSelectedId(null);
    setSub(integrations.length > 0 ? "ready" : "pick");
  }

  function handleSaved() {
    refetch();
    setSelectedId(null);
    setSub("ready");
  }

  function handleEdit(id: string) {
    setSelectedId(id);
    setSub("form");
  }

  function handleRemoved() {
    refetch();
    if (integrations.length <= 1) {
      // last one being removed — drop back to picker
      setSub("pick");
    }
  }

  if (sub == null) return null;

  const readyCountLabel =
    integrations.length === 1
      ? "One account ready. Add another or move on."
      : `${NUMBER_WORDS[integrations.length] ?? integrations.length} accounts ready. Add another or move on.`;

  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 pt-8 text-center">
      {sub === "pick" && (
          <div
            key="pick"
            className="flex w-full flex-col items-center gap-4"
          >
            {integrations.length > 0 && (
              <button
                type="button"
                onClick={() => setSub("ready")}
                className="self-start text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                ← back to connected accounts
              </button>
            )}
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Step Two · Accounts
            </div>
            <h1 className="max-w-[440px] font-serif text-4xl leading-[1.08] tracking-tight">
              Which accounts should Spent watch?
            </h1>
            <p className="max-w-[400px] text-sm leading-relaxed text-muted-foreground">
              Add every bank and card you want to track. Credentials are
              encrypted with AES-256 and stored on this machine only — they
              never leave your computer.
            </p>

            <PickerCard
              providers={filteredProviders}
              total={BANK_PROVIDERS.length}
              connectedIds={connectedIds}
              filter={filter}
              onFilter={setFilter}
              search={search}
              onSearch={setSearch}
              onPick={handlePick}
            />

            <p className="text-xs italic text-muted-foreground">
              Don&apos;t see your bank?{" "}
              <a
                href="https://github.com/Shaya16/Spent/issues"
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline decoration-primary underline-offset-2"
              >
                Open an issue
              </a>{" "}
              — we&apos;ll add a scraper.
            </p>
          </div>
        )}

        {sub === "form" && selected && (
          <div
            key={`form-${selected.id}`}
            className="flex w-full flex-col items-center gap-4"
          >
            <button
              type="button"
              onClick={handleCloseForm}
              className="self-start text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              ← back to providers
            </button>
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Connecting · {selected.name}
            </div>
            <h1 className="max-w-[440px] font-serif text-4xl leading-[1.08] tracking-tight">
              Sign in to {selected.name}
            </h1>
            <p className="max-w-[380px] text-sm leading-relaxed text-muted-foreground">
              Same credentials you use at{" "}
              <span className="text-foreground">{selected.domain}</span>.
              They&apos;re encrypted locally — nothing leaves this machine.
            </p>

            <CredentialForm
              info={selected}
              isEdit={connectedIds.has(selected.id)}
              onClose={handleCloseForm}
              onSaved={handleSaved}
            />
          </div>
        )}

        {sub === "ready" && integrations.length > 0 && (
          <div
            key="ready"
            className="flex w-full flex-col items-center gap-4"
          >
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Step Two · Accounts
            </div>
            <h1 className="max-w-[460px] font-serif text-4xl leading-[1.08] tracking-tight">
              {readyCountLabel}
            </h1>
            <p className="max-w-[380px] text-sm leading-relaxed text-muted-foreground">
              You can always come back from Settings to add or remove accounts.
            </p>

            <div className="w-full max-w-[460px] space-y-2 text-left">
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Connected · {integrations.length}
              </div>
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
                      exit={{ opacity: 0, x: -16, height: 0 }}
                      transition={{ duration: 0.22 }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                    >
                      <ProviderBadge
                        color={info.color}
                        name={info.name}
                        domain={info.domain}
                        size={36}
                        radius={9}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold tracking-tight">
                          {info.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {info.kind === "bank" ? "Bank" : "Credit cards"} ·{" "}
                          {info.credentialFields.length} credentials
                        </div>
                      </div>
                      <span className="rounded-full bg-primary/15 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-primary">
                        ✓ Ready
                      </span>
                      <button
                        type="button"
                        onClick={() => handleEdit(info.id)}
                        className="rounded-md px-2 py-1 text-xs font-medium hover:bg-accent"
                      >
                        Edit
                      </button>
                      <RemoveButton
                        provider={integ.provider}
                        onRemoved={handleRemoved}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
              <Button
                variant="outline"
                onClick={() => setSub("pick")}
                className="rounded-full px-5 py-2.5 text-sm font-semibold"
              >
                + Add another account
              </Button>
              <Button
                onClick={onComplete}
                disabled={integrations.length === 0}
                className="rounded-full px-5 py-2.5 text-sm font-semibold"
              >
                Continue to AI →
              </Button>
            </div>
          </div>
        )}

      <div className="mt-6 flex w-full max-w-[460px] items-center justify-between text-[10px] text-muted-foreground/80">
        <span>🔐 AES-256-GCM · stored locally</span>
        <span>
          {integrations.length} of {BANK_PROVIDERS.length} providers connected
        </span>
      </div>
    </div>
  );
}

function PickerCard({
  providers,
  total,
  connectedIds,
  filter,
  onFilter,
  search,
  onSearch,
  onPick,
}: {
  providers: ReadonlyArray<BankProviderInfo>;
  total: number;
  connectedIds: Set<string>;
  filter: "all" | BankKind;
  onFilter: (v: "all" | BankKind) => void;
  search: string;
  onSearch: (v: string) => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="w-full max-w-[480px] rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-[11px] font-bold tracking-tight">
          Supported providers · {total}
        </div>
        <FilterPills value={filter} onChange={onFilter} />
      </div>
      <Input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search by name..."
        className="mb-3"
      />
      <div className="flex flex-col gap-0.5">
        {providers.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            No providers match.
          </div>
        ) : (
          providers.map((p) => {
            const isConnected = connectedIds.has(p.id);
            const isDisabled = !p.enabled;
            return (
              <motion.button
                key={p.id}
                type="button"
                disabled={isDisabled}
                onClick={() => !isDisabled && onPick(p.id)}
                whileHover={!isDisabled ? { x: 1 } : undefined}
                className={`flex items-center gap-3 rounded-lg p-2.5 text-left transition-colors ${
                  isDisabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-muted/40"
                }`}
              >
                <ProviderBadge
                  color={p.color}
                  name={p.name}
                  domain={p.domain}
                  size={36}
                  radius={9}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold tracking-tight">
                      {p.name}
                    </span>
                    {isConnected && (
                      <span className="text-[10px] text-primary">✓</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {p.blurb}
                  </div>
                </div>
                <KindTag kind={p.kind} />
                <span
                  aria-hidden
                  className="ml-1 text-base leading-none text-muted-foreground"
                >
                  ›
                </span>
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}

function KindTag({ kind }: { kind: BankKind }) {
  const cls =
    kind === "bank"
      ? "bg-[color-mix(in_oklch,var(--primary)_12%,transparent)] text-[color-mix(in_oklch,var(--primary)_70%,black)]"
      : "bg-[color-mix(in_oklch,var(--status-heads-up)_18%,transparent)] text-[color-mix(in_oklch,var(--status-heads-up)_60%,black)]";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}
    >
      {kind === "bank" ? "Bank" : "Card"}
    </span>
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
    <div className="flex gap-0.5 rounded-full border border-border bg-background p-0.5">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`rounded-full px-3 py-1 text-[10px] font-medium transition-colors ${
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

function CredentialForm({
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
      setTimeout(onSaved, 500);
    } catch {
      setStatus("testing-fail");
      setErrorMsg("Failed to save credentials.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-[440px] rounded-2xl border border-border bg-card p-6 text-left shadow-sm">
      <div className="mb-5 flex items-center gap-3 border-b border-border/60 pb-4">
        <ProviderBadge
          color={info.color}
          name={info.name}
          domain={info.domain}
          size={44}
          radius={11}
        />
        <div className="min-w-0 flex-1">
          <div className="font-serif text-xl leading-tight tracking-tight">
            {info.name}
          </div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {info.kind === "bank" ? "Bank" : "Credit cards"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
        >
          ✕
        </button>
      </div>

      {!loaded ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
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
                  <Label
                    htmlFor={`${info.id}-${field.key}`}
                    className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground"
                  >
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
              className="flex-1 rounded-full"
            >
              {testing ? "Testing..." : "Test connection"}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!valid || saving}
              className="flex-1 rounded-full"
            >
              {saving ? "Saving..." : isEdit ? "Save changes" : "Save & continue"}
            </Button>
          </div>

          <div className="mt-2 flex items-start gap-2 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
            <span>🔐</span>
            <span>
              AES-256-GCM · stored on this machine only. Never sent to a server.
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
        type="button"
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
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
      >
        Cancel
      </button>
      <button
        type="button"
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
