"use client";

import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RECOMMENDED_OLLAMA_MODELS,
  type OllamaModelInfo,
} from "@/lib/types";
import {
  listOllamaModels,
  pullOllamaModel,
  saveAIConfig,
} from "@/lib/api";

type AIChoice = "claude" | "ollama" | "none";

interface AIStepProps {
  onComplete: () => void;
}

interface PullState {
  status: string;
  completed: number;
  total: number;
  speed: number;
  etaSeconds: number | null;
}

export function AIStep({ onComplete }: AIStepProps) {
  const [choice, setChoice] = useState<AIChoice | null>(null);
  const [apiKey, setApiKey] = useState("");
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
        if (error) {
          setOllamaReachable(false);
          setInstalledModels([]);
        } else {
          setOllamaReachable(true);
          setInstalledModels(models);
        }
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAIConfig({
        provider: choice ?? "none",
        apiKey: choice === "claude" ? apiKey : undefined,
        ollamaUrl: choice === "ollama" ? ollamaUrl : undefined,
        ollamaModel: choice === "ollama" ? ollamaModel : undefined,
      });
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const handlePull = () => {
    setPullError(null);
    setPullState({ status: "starting", completed: 0, total: 0, speed: 0, etaSeconds: null });
    const { cancel } = pullOllamaModel(ollamaModel, ollamaUrl, (event) => {
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
    });
    pullCancelRef.current = cancel;
  };

  const handleCancelPull = () => {
    pullCancelRef.current?.();
    pullCancelRef.current = null;
    setPullState(null);
  };

  const selectedModelInfo = RECOMMENDED_OLLAMA_MODELS.find(
    (m) => m.name === ollamaModel
  );
  const modelInstalled = installedModels.includes(ollamaModel);

  const canProceed =
    choice === "none" ||
    (choice === "claude" && apiKey.trim().length > 0) ||
    (choice === "ollama" &&
      ollamaUrl.trim().length > 0 &&
      ollamaModel.trim().length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Categorization</CardTitle>
        <CardDescription>
          Choose how to auto-categorize your transactions. You can change this
          later in settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          <OptionCard
            selected={choice === "claude"}
            onSelect={() => setChoice("claude")}
            title="Claude (Anthropic)"
            description="Fast and accurate via the Claude API. Requires an API key (paid)."
          />
          <OptionCard
            selected={choice === "ollama"}
            onSelect={() => setChoice("ollama")}
            title="Ollama (Local)"
            description="Free, private, runs entirely on your machine. Requires a one-time model download."
          />
          <OptionCard
            selected={choice === "none"}
            onSelect={() => setChoice("none")}
            title="Skip for now"
            description="You can enable AI categorization later from settings."
          />
        </div>

        {choice === "claude" && (
          <div className="space-y-2 pt-2">
            <Label htmlFor="apiKey">Claude API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
            />
            <p className="text-xs text-muted-foreground">
              Your key is encrypted and stored locally. Get one from{" "}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                console.anthropic.com
              </a>
              .
            </p>
          </div>
        )}

        {choice === "ollama" && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="ollamaUrl">Ollama URL</Label>
              <Input
                id="ollamaUrl"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
              {ollamaReachable === false && (
                <p className="text-xs text-destructive">
                  Couldn&apos;t reach Ollama. We&apos;ll try to auto-start it
                  when you sync. If it&apos;s not installed, get it from{" "}
                  <a
                    href="https://ollama.com"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    ollama.com
                  </a>
                  .
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Select
                value={ollamaModel}
                onValueChange={(v) => v && setOllamaModel(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECOMMENDED_OLLAMA_MODELS.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      <div className="flex items-center gap-2">
                        <span>{m.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {m.sizeGb} GB
                        </span>
                        {m.recommended && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                            recommended
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedModelInfo && (
                <p className="text-xs text-muted-foreground">
                  {selectedModelInfo.description}
                </p>
              )}
            </div>

            <ModelStatus
              modelName={ollamaModel}
              modelInfo={selectedModelInfo}
              installed={modelInstalled}
              ollamaReachable={ollamaReachable}
              pullState={pullState}
              pullError={pullError}
              onPull={handlePull}
              onCancel={handleCancelPull}
            />
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleSave}
          disabled={!canProceed || saving || !!pullState}
        >
          {saving ? "Saving..." : "Continue"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface ModelStatusProps {
  modelName: string;
  modelInfo?: OllamaModelInfo;
  installed: boolean;
  ollamaReachable: boolean | null;
  pullState: PullState | null;
  pullError: string | null;
  onPull: () => void;
  onCancel: () => void;
}

function ModelStatus({
  modelName,
  modelInfo,
  installed,
  ollamaReachable,
  pullState,
  pullError,
  onPull,
  onCancel,
}: ModelStatusProps) {
  if (installed) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
        <svg
          className="h-4 w-4 text-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
        <span>
          <span className="font-medium">{modelName}</span> is installed and
          ready.
        </span>
      </div>
    );
  }

  if (pullState) {
    const percent =
      pullState.total > 0
        ? Math.round((pullState.completed / pullState.total) * 100)
        : 0;
    const downloaded = formatBytes(pullState.completed);
    const total = formatBytes(pullState.total);
    const speed = pullState.speed > 0 ? formatBytes(pullState.speed) + "/s" : "";
    const eta =
      pullState.etaSeconds != null && pullState.etaSeconds > 0
        ? formatDuration(pullState.etaSeconds)
        : "";
    return (
      <div className="space-y-2 rounded-md border bg-muted/30 p-3">
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
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span>
            {downloaded} / {total} ({percent}%)
          </span>
          <span>
            {speed}
            {eta ? ` · ~${eta} left` : ""}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">Model not installed</div>
          <p className="text-xs text-muted-foreground">
            Download <span className="font-medium">{modelName}</span> now
            {modelInfo
              ? ` (~${modelInfo.sizeGb} GB, a few minutes depending on your connection)`
              : ""}
            . You only need to do this once.
          </p>
        </div>
        <Button
          size="sm"
          onClick={onPull}
          disabled={ollamaReachable === false}
        >
          Download
        </Button>
      </div>
      {pullError && (
        <p className="text-xs text-destructive">{pullError}</p>
      )}
    </div>
  );
}

function OptionCard({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-lg border p-4 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50"
      }`}
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{description}</div>
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1);
  return `${(bytes / Math.pow(1000, i)).toFixed(i >= 2 ? 2 : 0)} ${units[i]}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
