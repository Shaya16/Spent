"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RECOMMENDED_OLLAMA_MODELS,
  type OllamaModelInfo,
} from "@/lib/types";
import {
  listOllamaModels,
  pullOllamaModel,
  saveAIConfig,
  type PullEvent,
} from "@/lib/api";

type AIChoice = "claude" | "ollama" | "none";

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
  ollama: { bg: "#dbedd1", mid: "#a8d18d", ink: "#3e5a2e" },
  none: { bg: "#e6dfd1", mid: "#a89978", ink: "#5b5240" },
} as const;

interface ProviderMeta {
  id: AIChoice;
  title: string;
  tagline: string;
  icon: string;
  recommended?: boolean;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "claude",
    title: "Claude",
    tagline: "Anthropic API, fast and accurate",
    icon: "✦",
    recommended: true,
  },
  {
    id: "ollama",
    title: "Ollama",
    tagline: "Runs locally, free and private",
    icon: "◐",
  },
  {
    id: "none",
    title: "Manual",
    tagline: "No AI, categorize transactions yourself",
    icon: "↷",
  },
];

export function AIStep({ onComplete, onBack }: AIStepProps) {
  const [choice, setChoice] = useState<AIChoice>("claude");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
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

  const canContinue =
    choice === "none" ||
    (choice === "claude" && /^sk-ant-/.test(apiKey) && apiKey.length > 25) ||
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
    const { cancel } = pullOllamaModel(
      ollamaModel,
      ollamaUrl,
      (event: PullEvent) => {
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
          setInstalledModels((prev) =>
            prev.includes(ollamaModel) ? prev : [...prev, ollamaModel]
          );
        } else if (event.type === "error") {
          setPullError(event.data.message ?? "Failed to download the model.");
          setPullState(null);
        }
      }
    );
    pullCancelRef.current = cancel;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAIConfig({
        provider: choice,
        apiKey: choice === "claude" ? apiKey : undefined,
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
          Step 2 of 5
        </div>
        <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">
          How should we categorize?
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Spent uses AI to group your transactions into categories. You can
          change this any time in settings.
        </p>
      </header>

      <div className="flex flex-col gap-1.5">
        {PROVIDERS.map((p) => (
          <Fragment key={p.id}>
            <ProviderRow
              provider={p}
              selected={choice === p.id}
              onClick={() => setChoice(p.id)}
            />
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
                      <ClaudeConfig
                        apiKey={apiKey}
                        setApiKey={setApiKey}
                        showKey={showKey}
                        setShowKey={setShowKey}
                      />
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
          ← Back
        </Button>
        <Button onClick={handleSave} disabled={!canContinue || saving}>
          {saving ? "Saving..." : "Continue →"}
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
  const tint = TINTS[provider.id];
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
      style={{
        borderColor: selected ? tint.mid : "var(--border)",
        background: selected
          ? `color-mix(in oklch, ${tint.bg} 35%, var(--card))`
          : undefined,
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
          <span className="text-sm font-bold tracking-tight">
            {provider.title}
          </span>
          {provider.recommended && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-white"
              style={{ background: tint.mid }}
            >
              Recommended
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {provider.tagline}
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
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      )}
    </button>
  );
}

function ClaudeConfig({
  apiKey,
  setApiKey,
  showKey,
  setShowKey,
}: {
  apiKey: string;
  setApiKey: (v: string) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="claude-api-key" className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          API key
        </Label>
        <a
          href="https://console.anthropic.com"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-medium text-primary hover:underline"
        >
          Get a key ↗
        </a>
      </div>
      <div className="relative">
        <Input
          id="claude-api-key"
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-api03-..."
          className="font-mono pr-14"
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
        >
          {showKey ? "hide" : "show"}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Encrypted with AES-256-GCM and stored locally.
      </p>
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
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium"
        style={{
          background:
            reachable === false
              ? "rgba(232, 153, 104, 0.18)"
              : "rgba(168, 209, 141, 0.22)",
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
            Ollama not detected
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noreferrer"
              className="ml-auto font-bold underline"
            >
              Install ↗
            </a>
          </>
        ) : (
          <>Ollama running on {url}</>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="ollama-url" className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Server URL
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
          Pick a model
        </Label>
        <div className="grid grid-cols-3 gap-1.5">
          {RECOMMENDED_OLLAMA_MODELS.slice(0, 3).map((m) => (
            <button
              key={m.name}
              type="button"
              onClick={() => setModel(m.name)}
              className={`relative rounded-lg border bg-background p-2 text-left transition-colors ${
                model === m.name
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-[11px] font-bold tracking-tight">
                  {m.name}
                </span>
                {m.recommended && (
                  <span className="rounded-full bg-primary/10 px-1 py-0 text-[8px] font-bold uppercase tracking-wider text-primary">
                    rec
                  </span>
                )}
              </div>
              <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                {m.sizeGb} GB
              </div>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                {m.description}
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
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 text-[12px] leading-relaxed text-muted-foreground">
      Spent will leave transactions <span className="text-foreground">uncategorized</span>;
      you can assign categories from the transactions table any time. Switch to
      Claude or Ollama later in{" "}
      <span className="font-bold text-foreground">Settings → AI</span>.
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
  const info: OllamaModelInfo | undefined = RECOMMENDED_OLLAMA_MODELS.find(
    (m) => m.name === model
  );

  if (installed) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-[12px] font-medium text-primary">
        ✓ <span className="font-bold">{model}</span> is installed and ready.
      </div>
    );
  }

  if (pullState) {
    const percent =
      pullState.total > 0
        ? Math.round((pullState.completed / pullState.total) * 100)
        : 0;
    return (
      <div className="space-y-2 rounded-lg border border-border bg-background/50 p-2.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium">
            {pullState.status === "starting"
              ? "Starting download..."
              : pullState.status}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Cancel
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
            {formatBytes(pullState.completed)} / {formatBytes(pullState.total)}{" "}
            ({percent}%)
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
      <Button
        type="button"
        onClick={onPull}
        disabled={reachable === false}
        className="w-full"
      >
        ↓ Download {model} {info ? `(${info.sizeGb} GB)` : ""}
      </Button>
      {pullError && (
        <p className="text-[11px] text-destructive">{pullError}</p>
      )}
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
