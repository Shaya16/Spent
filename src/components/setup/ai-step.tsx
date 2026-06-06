"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listOllamaModels, type PullEvent, pullOllamaModel, saveAIConfig } from "@/lib/api";
import {
  type OllamaModelInfo,
  RECOMMENDED_GEMINI_MODELS,
  RECOMMENDED_OLLAMA_MODELS,
} from "@/lib/types";

type AIChoice = "claude" | "gemini" | "ollama" | "none";

interface AIStepProps {
  onComplete: () => void;
  onBack: () => void;
}

interface PullState {
  status: string;
  completed: number;
  total: number;
  speed: number;
  etaSeconds: number | null;
}

const TINTS = {
  claude: { bg: "#fad6c0", mid: "#e89968", ink: "#7a4222" },
  gemini: { bg: "#d3e3fd", mid: "#7fa6f0", ink: "#2b4a8a" },
  ollama: { bg: "#dbedd1", mid: "#a8d18d", ink: "#3e5a2e" },
  none: { bg: "#e6dfd1", mid: "#a89978", ink: "#5b5240" },
} as const;

interface ProviderMeta {
  id: AIChoice;
  titleKey: string;
  taglineKey: string;
  icon: string;
  recommended?: boolean;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "claude",
    titleKey: "aiProviderClaudeTitle",
    taglineKey: "aiProviderClaudeTagline",
    icon: "✦",
    recommended: true,
  },
  {
    id: "gemini",
    titleKey: "aiProviderGeminiTitle",
    taglineKey: "aiProviderGeminiTagline",
    icon: "✧",
  },
  {
    id: "ollama",
    titleKey: "aiProviderOllamaTitle",
    taglineKey: "aiProviderOllamaTagline",
    icon: "◐",
  },
  {
    id: "none",
    titleKey: "aiProviderManualTitle",
    taglineKey: "aiProviderManualTagline",
    icon: "↷",
  },
];

function ollamaModelKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_");
}

function ollamaModelDescription(
  name: string,
  fallback: string,
  tModels: ReturnType<typeof useTranslations<"ollamaModels">>,
): string {
  const key = ollamaModelKey(name);
  try {
    const translated = tModels(key);
    return translated && translated !== key ? translated : fallback;
  } catch {
    return fallback;
  }
}

export function AIStep({ onComplete, onBack }: AIStepProps) {
  const t = useTranslations("setup");
  const [choice, setChoice] = useState<AIChoice>("claude");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiModel, setGeminiModel] = useState(RECOMMENDED_GEMINI_MODELS[0].name);
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("llama3.2:3b");
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [ollamaReachable, setOllamaReachable] = useState<boolean | null>(null);
  const [pullState, setPullState] = useState<PullState | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pullCancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (choice !== "ollama") return;
    let cancelled = false;
    (async () => {
      try {
        const { models, error } = await listOllamaModels(ollamaUrl);
        if (cancelled) return;
        setOllamaReachable(!error);
        setInstalledModels(error ? [] : models);
      } catch {
        if (!cancelled) {
          setOllamaReachable(false);
          setInstalledModels([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [choice, ollamaUrl, pullState?.status]);

  const modelInstalled = installedModels.includes(ollamaModel);

  const trimmedApiKey = apiKey.trim();
  const trimmedGeminiKey = geminiKey.trim();

  const canContinue =
    choice === "none" ||
    (choice === "claude" && /^sk-ant-/.test(trimmedApiKey) && trimmedApiKey.length > 25) ||
    (choice === "gemini" && trimmedGeminiKey.length > 30) ||
    (choice === "ollama" && modelInstalled);

  const handlePull = () => {
    setPullError(null);
    setPullState({
      status: "starting",
      completed: 0,
      total: 0,
      speed: 0,
      etaSeconds: null,
    });
    const { cancel } = pullOllamaModel(ollamaModel, ollamaUrl, (event: PullEvent) => {
      if (event.type === "progress") {
        setPullState({
          status: event.data.status,
          completed: event.data.completed ?? 0,
          total: event.data.total ?? 0,
          speed: event.data.speed ?? 0,
          etaSeconds: event.data.etaSeconds ?? null,
        });
      } else if (event.type === "complete") {
        setPullState(null);
        setInstalledModels((prev) => (prev.includes(ollamaModel) ? prev : [...prev, ollamaModel]));
      } else if (event.type === "error") {
        setPullError(event.data.message ?? t("aiOllamaFailedDownload"));
        setPullState(null);
      }
    });
    pullCancelRef.current = cancel;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAIConfig({
        provider: choice,
        claudeApiKey: choice === "claude" ? trimmedApiKey : undefined,
        geminiApiKey: choice === "gemini" ? trimmedGeminiKey : undefined,
        geminiModel: choice === "gemini" ? geminiModel : undefined,
        ollamaUrl: choice === "ollama" ? ollamaUrl : undefined,
        ollamaModel: choice === "ollama" ? ollamaModel : undefined,
      });
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-6">
      <header className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t("aiStepLabel")}
        </div>
        <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">{t("aiTitle")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("aiDescription")}</p>
      </header>

      <div className="flex flex-col gap-1.5">
        {PROVIDERS.map((p) => (
          <Fragment key={p.id}>
            <ProviderRow provider={p} selected={choice === p.id} onClick={() => setChoice(p.id)} />
            <AnimatePresence initial={false}>
              {choice === p.id && (
                <motion.div
                  key={`config-${p.id}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.2, 0.7, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="pt-1.5">
                    {p.id === "claude" && (
                      <ApiKeyConfig
                        id="claude-api-key"
                        apiKey={apiKey}
                        setApiKey={setApiKey}
                        showKey={showKey}
                        setShowKey={setShowKey}
                        placeholder="sk-ant-api03-..."
                        getKeyUrl="https://console.anthropic.com"
                      />
                    )}
                    {p.id === "gemini" && (
                      <ApiKeyConfig
                        id="gemini-api-key"
                        apiKey={geminiKey}
                        setApiKey={setGeminiKey}
                        showKey={showGeminiKey}
                        setShowKey={setShowGeminiKey}
                        placeholder="AIza..."
                        getKeyUrl="https://aistudio.google.com/apikey"
                      >
                        <GeminiModelPicker model={geminiModel} setModel={setGeminiModel} />
                      </ApiKeyConfig>
                    )}
                    {p.id === "ollama" && (
                      <OllamaConfig
                        url={ollamaUrl}
                        setUrl={setOllamaUrl}
                        model={ollamaModel}
                        setModel={setOllamaModel}
                        reachable={ollamaReachable}
                        modelInstalled={modelInstalled}
                        pullState={pullState}
                        pullError={pullError}
                        onPull={handlePull}
                        onCancel={() => {
                          pullCancelRef.current?.();
                          setPullState(null);
                        }}
                      />
                    )}
                    {p.id === "none" && <ManualNote />}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Fragment>
        ))}
      </div>

      <footer className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          {t("aiBackButton")}
        </Button>
        <Button onClick={handleSave} disabled={!canContinue || saving}>
          {saving ? t("aiSavingButton") : t("aiContinueButton")}
        </Button>
      </footer>
    </div>
  );
}

function ProviderRow({
  provider,
  selected,
  onClick,
}: {
  provider: ProviderMeta;
  selected: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("setup");
  const tint = TINTS[provider.id];
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-start transition-colors hover:bg-accent/40"
      style={{
        borderColor: selected ? tint.mid : "var(--border)",
        background: selected ? `color-mix(in oklch, ${tint.bg} 35%, var(--card))` : undefined,
        borderWidth: 1.5,
      }}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{ background: tint.bg, color: tint.ink }}
      >
        {provider.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold tracking-tight">{t(provider.titleKey)}</span>
          {provider.recommended && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-white"
              style={{ background: tint.mid }}
            >
              {t("aiRecommendedBadge")}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {t(provider.taglineKey)}
        </div>
      </div>
      {selected ? (
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: tint.mid }}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 rtl:rotate-180" />
      )}
    </button>
  );
}

function ApiKeyConfig({
  id,
  apiKey,
  setApiKey,
  showKey,
  setShowKey,
  placeholder,
  getKeyUrl,
  children,
}: {
  id: string;
  apiKey: string;
  setApiKey: (v: string) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  placeholder: string;
  getKeyUrl: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("setup");
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label
            htmlFor={id}
            className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground"
          >
            {t("aiClaudeKeyLabel")}
          </Label>
          <a
            href={getKeyUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-medium text-primary hover:underline"
          >
            {t("aiClaudeGetKey")}
          </a>
        </div>
        <div className="relative">
          <Input
            id={id}
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={placeholder}
            className="font-mono pe-14"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
          >
            {showKey ? t("aiClaudeHide") : t("aiClaudeShow")}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("aiClaudeEncryptedNote")}</p>
      </div>
      {children}
    </div>
  );
}

function GeminiModelPicker({ model, setModel }: { model: string; setModel: (v: string) => void }) {
  const t = useTranslations("setup");
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {t("aiOllamaPickModel")}
      </Label>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {RECOMMENDED_GEMINI_MODELS.map((m) => (
          <button
            key={m.name}
            type="button"
            onClick={() => setModel(m.name)}
            className={`rounded-lg border bg-background p-2 text-start transition-colors ${
              model === m.name
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40"
            }`}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className="truncate text-[11px] font-bold tracking-tight">{m.name}</span>
              {m.recommended && (
                <span className="rounded-full bg-primary/10 px-1 py-0 text-[8px] font-bold uppercase tracking-wider text-primary">
                  {t("aiModelRecommendedBadge")}
                </span>
              )}
            </div>
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{m.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function OllamaConfig({
  url,
  setUrl,
  model,
  setModel,
  reachable,
  modelInstalled,
  pullState,
  pullError,
  onPull,
  onCancel,
}: {
  url: string;
  setUrl: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  reachable: boolean | null;
  modelInstalled: boolean;
  pullState: PullState | null;
  pullError: string | null;
  onPull: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("setup");
  const tModels = useTranslations("ollamaModels");
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium"
        style={{
          background:
            reachable === false ? "rgba(232, 153, 104, 0.18)" : "rgba(168, 209, 141, 0.22)",
          color: reachable === false ? "#9a4a26" : "#3e5a2e",
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: reachable === false ? "#c97b5c" : "#6b8c70",
          }}
        />
        {reachable === false ? (
          <>
            {t("aiOllamaNotDetected")}
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noreferrer"
              className="ms-auto font-bold underline"
            >
              {t("aiOllamaInstall")}
            </a>
          </>
        ) : (
          <>{t("aiOllamaRunningOn", { url })}</>
        )}
      </div>

      <div className="space-y-1">
        <Label
          htmlFor="ollama-url"
          className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground"
        >
          {t("aiOllamaServerUrl")}
        </Label>
        <Input
          id="ollama-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="font-mono text-[12px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {t("aiOllamaPickModel")}
        </Label>
        <div className="grid grid-cols-3 gap-1.5">
          {RECOMMENDED_OLLAMA_MODELS.slice(0, 3).map((m) => (
            <button
              key={m.name}
              type="button"
              onClick={() => setModel(m.name)}
              className={`relative rounded-lg border bg-background p-2 text-start transition-colors ${
                model === m.name
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-[11px] font-bold tracking-tight">{m.name}</span>
                {m.recommended && (
                  <span className="rounded-full bg-primary/10 px-1 py-0 text-[8px] font-bold uppercase tracking-wider text-primary">
                    {t("aiModelRecommendedBadge")}
                  </span>
                )}
              </div>
              <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                {t("aiModelSizeGb", { size: m.sizeGb })}
              </div>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                {ollamaModelDescription(m.name, m.description, tModels)}
              </p>
            </button>
          ))}
        </div>
      </div>

      <OllamaPullCTA
        model={model}
        installed={modelInstalled}
        reachable={reachable}
        pullState={pullState}
        pullError={pullError}
        onPull={onPull}
        onCancel={onCancel}
      />
    </div>
  );
}

function ManualNote() {
  const t = useTranslations("setup");
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 text-[12px] leading-relaxed text-muted-foreground">
      {t("aiManualNoteBefore")}{" "}
      <span className="text-foreground">{t("aiManualNoteUncategorized")}</span>
      {t("aiManualNoteAfterWithGemini")}{" "}
      <span className="font-bold text-foreground">{t("aiManualNoteSettingsLink")}</span>
      {t("aiManualNoteEnd")}
    </div>
  );
}

function OllamaPullCTA({
  model,
  installed,
  reachable,
  pullState,
  pullError,
  onPull,
  onCancel,
}: {
  model: string;
  installed: boolean;
  reachable: boolean | null;
  pullState: PullState | null;
  pullError: string | null;
  onPull: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("setup");
  const info: OllamaModelInfo | undefined = RECOMMENDED_OLLAMA_MODELS.find((m) => m.name === model);

  if (installed) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-[12px] font-medium text-primary">
        {t.rich("aiOllamaInstalledReadyRich", {
          model,
          b: (chunks) => <span className="font-bold">{chunks}</span>,
        })}
      </div>
    );
  }

  if (pullState) {
    const percent =
      pullState.total > 0 ? Math.round((pullState.completed / pullState.total) * 100) : 0;
    return (
      <div className="space-y-2 rounded-lg border border-border bg-background/50 p-2.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium">
            {pullState.status === "starting" ? t("aiOllamaStartingDownload") : pullState.status}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            {t("aiOllamaCancel")}
          </button>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full"
            style={{ background: "#a8d18d" }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>
            {formatBytes(pullState.completed)} / {formatBytes(pullState.total)} ({percent}%)
          </span>
          <span>
            {pullState.speed > 0 ? `${formatBytes(pullState.speed)}/s` : ""}
            {pullState.etaSeconds != null && pullState.etaSeconds > 0
              ? ` · ~${formatDuration(pullState.etaSeconds)}`
              : ""}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Button type="button" onClick={onPull} disabled={reachable === false} className="w-full">
        {t("aiOllamaDownloadButton", {
          model,
          size: info ? `(${info.sizeGb} GB)` : "",
        })}
      </Button>
      {pullError && <p className="text-[11px] text-destructive">{pullError}</p>}
    </div>
  );
}

function formatBytes(b: number): string {
  if (b <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log10(b) / 3), u.length - 1);
  return `${(b / Math.pow(1000, i)).toFixed(i >= 2 ? 2 : 0)} ${u[i]}`;
}

function formatDuration(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}
