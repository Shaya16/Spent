"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  claude: {
    bg: "#fad6c0",
    mid: "#e89968",
    ink: "#7a4222",
  },
  ollama: {
    bg: "#dbedd1",
    mid: "#a8d18d",
    ink: "#3e5a2e",
  },
  none: {
    bg: "#e6dfd1",
    mid: "#a89978",
    ink: "#5b5240",
  },
} as const;

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
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Step 2 of 3
        </div>
        <h1 className="font-serif text-4xl leading-tight">
          How should we categorize?
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Spent uses AI to sort transactions into Groceries, Dining,
          Subscriptions, and so on. Pick a provider — you can change this any
          time.
        </p>
      </header>

      <div className="grid gap-2.5 md:grid-cols-3">
        {(
          [
            {
              id: "claude" as const,
              title: "Claude",
              sub: "Anthropic API",
              detail: "Fast and accurate · paid API",
              icon: "✦",
            },
            {
              id: "ollama" as const,
              title: "Ollama",
              sub: "Runs locally",
              detail: "Free, private · needs install",
              icon: "◐",
            },
            {
              id: "none" as const,
              title: "Manual",
              sub: "No AI for now",
              detail: "Categorize transactions yourself",
              icon: "↷",
            },
          ]
        ).map((o) => {
          const tint = TINTS[o.id];
          const sel = choice === o.id;
          return (
            <motion.button
              key={o.id}
              onClick={() => setChoice(o.id)}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
              className="flex flex-col gap-2.5 rounded-2xl border p-4 text-left transition-colors"
              style={{
                background: sel ? tint.bg : "var(--card)",
                borderColor: sel ? tint.mid : "var(--border)",
                borderWidth: 1.5,
              }}
            >
              <div className="flex items-center justify-between">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
                  style={{
                    background: sel ? "#fff" : tint.bg,
                    color: tint.ink,
                  }}
                >
                  {o.icon}
                </div>
                {sel && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: tint.ink }}
                  >
                    ✓
                  </motion.span>
                )}
              </div>
              <div>
                <div
                  className="text-base font-bold tracking-tight"
                  style={{ color: sel ? tint.ink : "var(--foreground)" }}
                >
                  {o.title}
                </div>
                <div
                  className="mt-0.5 text-xs"
                  style={{
                    color: sel ? tint.ink : "var(--muted-foreground)",
                    opacity: sel ? 0.75 : 1,
                  }}
                >
                  {o.sub}
                </div>
              </div>
              <div
                className="mt-auto text-[11px] leading-snug"
                style={{
                  color: sel ? tint.ink : "var(--muted-foreground)",
                  opacity: sel ? 0.75 : 0.85,
                }}
              >
                {o.detail}
              </div>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {choice === "claude" && (
          <motion.div
            key="claude-config"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="space-y-3 rounded-2xl bg-card p-5"
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
                style={{ background: TINTS.claude.bg, color: TINTS.claude.ink }}
              >
                ✦
              </div>
              <div className="flex-1 text-sm font-bold tracking-tight">
                Claude API key
              </div>
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-primary hover:underline"
              >
                Get a key ↗
              </a>
            </div>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="font-mono pr-14"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
              >
                {showKey ? "hide" : "show"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Your key is encrypted with AES-256-GCM and stored locally.
            </p>
          </motion.div>
        )}

        {choice === "ollama" && (
          <motion.div
            key="ollama-config"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 rounded-2xl bg-card p-5"
          >
            <div
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-medium"
              style={{
                background:
                  ollamaReachable === false
                    ? "rgba(232, 153, 104, 0.18)"
                    : "rgba(168, 209, 141, 0.22)",
                color:
                  ollamaReachable === false ? "#9a4a26" : "#3e5a2e",
              }}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background:
                    ollamaReachable === false ? "#c97b5c" : "#6b8c70",
                }}
              />
              {ollamaReachable === false ? (
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
                <>Ollama running on {ollamaUrl}</>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ollama-url">Ollama URL</Label>
              <Input
                id="ollama-url"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Choose a model</Label>
              <div className="grid gap-2 md:grid-cols-3">
                {RECOMMENDED_OLLAMA_MODELS.slice(0, 3).map((m) => (
                  <button
                    key={m.name}
                    onClick={() => setOllamaModel(m.name)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      ollamaModel === m.name
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-1.5">
                      <span className="text-xs font-bold tracking-tight">
                        {m.name}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {m.sizeGb} GB
                      </span>
                    </div>
                    {m.recommended && (
                      <span className="mt-1 inline-block rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                        recommended
                      </span>
                    )}
                    <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                      {m.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <OllamaPullCTA
              model={ollamaModel}
              installed={modelInstalled}
              reachable={ollamaReachable}
              pullState={pullState}
              pullError={pullError}
              onPull={handlePull}
              onCancel={() => {
                pullCancelRef.current?.();
                setPullState(null);
              }}
            />
          </motion.div>
        )}

        {choice === "none" && (
          <motion.div
            key="none-config"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl bg-card p-5 text-sm leading-relaxed text-muted-foreground"
          >
            That&apos;s fine — Spent will leave transactions uncategorized and
            you can assign categories from the transactions table any time. You
            can switch to Claude or Ollama later in{" "}
            <b className="text-foreground">Settings → AI</b>.
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={handleSave} disabled={!canContinue || saving}>
          {saving ? "Saving..." : "Finish setup →"}
        </Button>
      </footer>
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
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary"
      >
        ✓ <span className="font-bold">{model}</span> is installed and ready.
      </motion.div>
    );
  }

  if (pullState) {
    const percent =
      pullState.total > 0
        ? Math.round((pullState.completed / pullState.total) * 100)
        : 0;
    return (
      <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {pullState.status === "starting"
              ? "Starting download..."
              : pullState.status}
          </span>
          <button
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full"
            style={{ background: "#a8d18d" }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
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
    <>
      <Button
        onClick={onPull}
        disabled={reachable === false}
        className="w-full"
      >
        ↓ Download {model} {info ? `(${info.sizeGb} GB)` : ""}
      </Button>
      {pullError && (
        <p className="mt-1 text-xs text-destructive">{pullError}</p>
      )}
    </>
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
