"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteIntegration,
  getIntegrationCredentials,
  listIntegrations,
  saveBankCredentials,
  testBankConnection,
} from "@/lib/api";
import { GITHUB_ISSUES_URL } from "@/lib/constants";
import { translateProviderBlurb, translateProviderName } from "@/lib/i18n-data";
import { BANK_PROVIDERS, type BankKind, type BankProviderInfo } from "@/lib/types";
import { ProviderBadge } from "./provider-badge";
import { TwoFactorSection } from "./two-factor-section";

type Sub = "pick" | "form" | "ready";

interface BankStepProps {
  onComplete: () => void;
}

export function BankStep({ onComplete }: BankStepProps) {
  const t = useTranslations("setup");
  const tc = useTranslations("common");
  const tBanks = useTranslations("banks");
  const [filter, setFilter] = useState<"all" | BankKind>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingCredentialId, setEditingCredentialId] = useState<number | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);

  const {
    data: integrations = [],
    isPending,
    refetch,
  } = useQuery({
    queryKey: ["integrations"],
    queryFn: listIntegrations,
  });

  // Pick the right starting view once we've heard back from the query
  useEffect(() => {
    if (isPending || sub != null) return;
    setSub(integrations.length > 0 ? "ready" : "pick");
  }, [isPending, integrations.length, sub]);

  const connectedIds = new Set(integrations.map((i) => i.provider));
  const selected = selectedId ? (BANK_PROVIDERS.find((p) => p.id === selectedId) ?? null) : null;

  const filteredProviders = BANK_PROVIDERS.filter((p) => {
    if (filter !== "all" && p.kind !== filter) return false;
    if (search) {
      const needle = search.toLowerCase();
      const name = translateProviderName(p.id, p.name, tBanks).toLowerCase();
      const blurb = translateProviderBlurb(p.id, p.blurb, tBanks).toLowerCase();
      if (!name.includes(needle) && !blurb.includes(needle)) return false;
    }
    return true;
  });

  function handlePick(id: string) {
    setSelectedId(id);
    setEditingCredentialId(null);
    setSub("form");
  }

  function handleCloseForm() {
    setSelectedId(null);
    setEditingCredentialId(null);
    setSub(integrations.length > 0 ? "ready" : "pick");
  }

  function handleSaved() {
    refetch();
    setSelectedId(null);
    setEditingCredentialId(null);
    setSub("ready");
  }

  function handleEditCredential(credentialId: number) {
    const integ = integrations.find((i) => i.id === credentialId);
    if (!integ) return;
    setSelectedId(integ.provider);
    setEditingCredentialId(credentialId);
    setSub("form");
  }

  const editingIntegration =
    editingCredentialId != null
      ? (integrations.find((i) => i.id === editingCredentialId) ?? null)
      : null;

  function handleRemoved() {
    refetch();
    if (integrations.length <= 1) {
      // last one being removed, drop back to picker
      setSub("pick");
    }
  }

  if (sub == null) return null;

  const readyCountLabel =
    integrations.length === 1
      ? t("bankOneReady")
      : t("bankManyReady", { count: integrations.length });

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6">
      {sub === "pick" && (
        <div key="pick" className="flex w-full flex-col gap-4">
          {integrations.length > 0 && (
            <button
              type="button"
              onClick={() => setSub("ready")}
              className="self-start text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {t("bankBackToConnected")}
            </button>
          )}
          <header className="space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t("bankStep")}
            </div>
            <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">
              {t("bankTitleQuestion")}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">{t("bankDescription")}</p>
          </header>

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
            {t("bankDontSeeBankPrefix")}{" "}
            <a
              href={GITHUB_ISSUES_URL}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-primary underline-offset-2"
            >
              {t("bankOpenIssueLink")}
            </a>{" "}
            {t("bankDontSeeBankSuffix")}
          </p>
        </div>
      )}

      {sub === "form" && selected && (
        <div key={`form-${selected.id}`} className="flex w-full flex-col gap-4">
          <button
            type="button"
            onClick={handleCloseForm}
            className="self-start text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {t("bankBackToProviders")}
          </button>
          <header className="space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t("bankConnectingStep", {
                name: translateProviderName(selected.id, selected.name, tBanks),
              })}
            </div>
            <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">
              {t("bankSignInTitle", {
                name: translateProviderName(selected.id, selected.name, tBanks),
              })}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("bankSignInDescriptionPrefix")}{" "}
              <span className="text-foreground">{selected.domain}</span>
              {t("bankSignInDescriptionSuffix")}
            </p>
          </header>

          <CredentialForm
            key={`${selected.id}-${editingCredentialId ?? "new"}`}
            info={selected}
            credentialId={editingCredentialId}
            initialLabel={editingIntegration?.label ?? ""}
            isEdit={editingCredentialId != null}
            onClose={handleCloseForm}
            onSaved={handleSaved}
          />
        </div>
      )}

      {sub === "ready" && integrations.length > 0 && (
        <div key="ready" className="flex w-full flex-col gap-4">
          <header className="space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {t("bankStep")}
            </div>
            <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">{readyCountLabel}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("bankReadyDescription")}
            </p>
          </header>

          <div className="w-full space-y-2 text-start">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {t("bankConnectedHeading", { count: integrations.length })}
            </div>
            <AnimatePresence initial={false}>
              {integrations.map((integ) => {
                const info = BANK_PROVIDERS.find((p) => p.id === integ.provider);
                if (!info) return null;
                return (
                  <motion.div
                    key={integ.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16, height: 0 }}
                    transition={{ duration: 0.22 }}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <ProviderBadge
                      color={info.color}
                      name={translateProviderName(info.id, info.name, tBanks)}
                      domain={info.domain}
                      size={36}
                      radius={9}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold tracking-tight">{integ.label}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {translateProviderName(info.id, info.name, tBanks)}
                      </div>
                    </div>
                    <span className="rounded-full bg-primary/15 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-primary">
                      {t("bankReadyBadge")}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleEditCredential(integ.id)}
                      className="rounded-md px-2 py-1 text-xs font-medium hover:bg-accent"
                    >
                      {tc("edit")}
                    </button>
                    <RemoveButton credentialId={integ.id} onRemoved={handleRemoved} />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <footer className="mt-2 flex items-center justify-between pt-2">
            <Button variant="outline" onClick={() => setSub("pick")}>
              {t("bankAddAnother")}
            </Button>
            <Button onClick={onComplete} disabled={integrations.length === 0}>
              {t("bankContinueToAi")}
            </Button>
          </footer>
        </div>
      )}

      <div className="mt-2 flex w-full items-center justify-between text-[10px] text-muted-foreground/80">
        <span>{t("bankEncryptedFooter")}</span>
        <span>
          {t("bankProvidersConnected", {
            connected: integrations.length,
            total: BANK_PROVIDERS.length,
          })}
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
  const t = useTranslations("setup");
  const tBanks = useTranslations("banks");
  return (
    <div className="w-full rounded-2xl border border-border bg-card p-5 text-start shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-[11px] font-bold tracking-tight">
          {t("bankSupportedProviders", { count: total })}
        </div>
        <FilterPills value={filter} onChange={onFilter} />
      </div>
      <Input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={t("bankSearchPlaceholder")}
        className="mb-3"
      />
      <div className="flex flex-col gap-0.5">
        {providers.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            {t("bankNoMatches")}
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
                className={`flex items-center gap-3 rounded-lg p-2.5 text-start transition-colors ${
                  isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted/40"
                }`}
              >
                <ProviderBadge
                  color={p.color}
                  name={translateProviderName(p.id, p.name, tBanks)}
                  domain={p.domain}
                  size={36}
                  radius={9}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold tracking-tight">
                      {translateProviderName(p.id, p.name, tBanks)}
                    </span>
                    {isConnected && <span className="text-[10px] text-primary">✓</span>}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {translateProviderBlurb(p.id, p.blurb, tBanks)}
                  </div>
                </div>
                <KindTag kind={p.kind} />
                <span aria-hidden className="ms-1 text-base leading-none text-muted-foreground">
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
  const t = useTranslations("setup");
  const cls =
    kind === "bank"
      ? "bg-[color-mix(in_oklch,var(--primary)_12%,transparent)] text-[color-mix(in_oklch,var(--primary)_70%,black)]"
      : "bg-[color-mix(in_oklch,var(--status-heads-up)_18%,transparent)] text-[color-mix(in_oklch,var(--status-heads-up)_60%,black)]";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}
    >
      {kind === "bank" ? t("bankKindBank") : t("bankKindCard")}
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
  const t = useTranslations("setup");
  const options: { id: "all" | BankKind; label: string }[] = [
    { id: "all", label: t("bankFilterAll") },
    { id: "bank", label: t("bankFilterBanks") },
    { id: "card", label: t("bankFilterCards") },
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
  credentialId,
  initialLabel,
  isEdit,
  onClose,
  onSaved,
}: {
  info: BankProviderInfo;
  credentialId: number | null;
  initialLabel: string;
  isEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("setup");
  const tc = useTranslations("common");
  const tBanks = useTranslations("banks");
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(initialLabel);
  const [savedCredentialId, setSavedCredentialId] = useState<number | null>(credentialId);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [requiresManualTwoFactor, setRequiresManualTwoFactor] = useState(false);
  const [loaded, setLoaded] = useState(!isEdit);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "testing-ok" | "testing-fail" | "saved">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setSavedCredentialId(credentialId);
  }, [credentialId]);

  useEffect(() => {
    if (!isEdit || credentialId == null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getIntegrationCredentials(credentialId);
        if (cancelled) return;
        if (res.credentials) setCredentials(res.credentials);
        if (res.label) setLabel(res.label);
        setRequiresManualTwoFactor(res.requiresManualTwoFactor);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, credentialId]);

  const valid =
    label.trim().length > 0 &&
    info.credentialFields.every((f) => {
      const v = credentials[f.key]?.trim() ?? "";
      if (!v) return false;
      if (f.exactLength != null && v.length !== f.exactLength) return false;
      return true;
    });

  const saveOptions = (id: number | null) => ({
    label: label.trim(),
    ...(id != null ? { credentialId: id } : {}),
    requiresManualTwoFactor,
  });

  const handleTest = async () => {
    setTesting(true);
    setStatus("idle");
    setErrorMsg(null);
    try {
      const existingId = savedCredentialId;
      let testId = existingId;
      if (existingId != null) {
        const saved = await saveBankCredentials(info.id, credentials, saveOptions(existingId));
        testId = saved.credentialId;
        setSavedCredentialId(testId);
      }
      const res = await testBankConnection(info.id, {
        ...(testId != null ? { credentialId: testId } : { credentials }),
      });
      if (res.success) {
        setStatus("testing-ok");
      } else {
        setStatus("testing-fail");
        setErrorMsg(res.message);
      }
    } catch {
      setStatus("testing-fail");
      setErrorMsg(t("bankConnectionTestFailed"));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveBankCredentials(info.id, credentials, saveOptions(savedCredentialId));
      setSavedCredentialId(saved.credentialId);
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      setStatus("saved");
      setTimeout(onSaved, 500);
    } catch {
      setStatus("testing-fail");
      setErrorMsg(t("bankFailedToSaveCredentials"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-border bg-card p-6 text-start shadow-sm">
      <div className="mb-5 flex items-center gap-3 border-b border-border/60 pb-4">
        <ProviderBadge
          color={info.color}
          name={translateProviderName(info.id, info.name, tBanks)}
          domain={info.domain}
          size={44}
          radius={11}
        />
        <div className="min-w-0 flex-1">
          <div className="font-serif text-xl leading-tight tracking-tight">
            {translateProviderName(info.id, info.name, tBanks)}
          </div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {info.kind === "bank" ? t("bankKindBank") : t("bankKindCardPlural")}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tc("close")}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
        >
          ✕
        </button>
      </div>

      {!loaded ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{tc("loadingValues")}</div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${info.id}-label`}>{t("bankAccountLabel")}</Label>
            <Input
              id={`${info.id}-label`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("bankAccountLabelPlaceholder", {
                name: translateProviderName(info.id, info.name, tBanks),
              })}
            />
          </div>
          {info.credentialFields.map((field) => {
            const value = credentials[field.key] ?? "";
            const tooShort =
              field.exactLength != null && value.length > 0 && value.length !== field.exactLength;
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
                      {t("bankCharCount", { current: value.length, max: field.maxLength })}
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
                    if (field.exactLength) next = next.slice(0, field.exactLength);
                    if (field.maxLength) next = next.slice(0, field.maxLength);
                    setCredentials((prev) => ({
                      ...prev,
                      [field.key]: next,
                    }));
                  }}
                  placeholder={field.placeholder ?? field.label}
                  className={field.numeric ? "font-mono" : undefined}
                />
                {field.hint && <p className="text-[11px] text-muted-foreground">{field.hint}</p>}
                {tooShort && (
                  <p className="text-[11px] text-destructive">
                    {t("bankExactLengthError", { count: field.exactLength ?? 0 })}
                  </p>
                )}
              </div>
            );
          })}

          <TwoFactorSection
            info={info}
            requiresManualTwoFactor={requiresManualTwoFactor}
            onChangeManualFlag={setRequiresManualTwoFactor}
          />

          <AnimatePresence>
            {status === "testing-ok" && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary"
              >
                {t("bankConnectionWorks")}
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
                {t("bankSavedFlash")}
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
              {testing ? t("bankTesting") : t("bankTestConnection")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!valid || saving}
              className="flex-1 rounded-full"
            >
              {saving ? tc("saving") : isEdit ? tc("saveChanges") : t("bankSaveAndContinue")}
            </Button>
          </div>

          <div className="mt-2 flex items-start gap-2 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
            <span>🔐</span>
            <span>{t("bankAesNote")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function RemoveButton({
  credentialId,
  onRemoved,
}: {
  credentialId: number;
  onRemoved: () => void;
}) {
  const tc = useTranslations("common");
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
      >
        {tc("remove")}
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
        {tc("cancel")}
      </button>
      <button
        type="button"
        onClick={async () => {
          setRemoving(true);
          await deleteIntegration(credentialId);
          setRemoving(false);
          onRemoved();
        }}
        disabled={removing}
        className="rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground"
      >
        {removing ? "..." : tc("confirm")}
      </button>
    </div>
  );
}
