"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { listOllamaModels, type PullEvent, pullOllamaModel } from "@/lib/api";
import { type OllamaModelInfo, RECOMMENDED_OLLAMA_MODELS } from "@/lib/types";

interface PullState {
  status: string;
  completed: number;
  total: number;
  speed: number;
  etaSeconds: number | null;
}

interface OllamaModelStatusProps {
  ollamaUrl: string;
  model: string;
}

export function OllamaModelStatus({ ollamaUrl, model }: OllamaModelStatusProps) {
  const t = useTranslations("ollamaStatus");
  const [installed, setInstalled] = useState<string[] | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [pullState, setPullState] = useState<PullState | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const pullCancelRef = useRef<(() => void) | null>(null);

  // Refresh installed-list whenever model or url changes, or a pull finishes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { models, error } = await listOllamaModels(ollamaUrl);
        if (cancelled) return;
        if (error) {
          setReachable(false);
          setInstalled([]);
        } else {
          setReachable(true);
          setInstalled(models);
        }
      } catch {
        if (!cancelled) {
          setReachable(false);
          setInstalled([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ollamaUrl]);

  const modelInfo = RECOMMENDED_OLLAMA_MODELS.find((m) => m.name === model);
  const modelInstalled = installed?.includes(model) ?? false;

  const handlePull = () => {
    setPullError(null);
    setPullState({
      status: "starting",
      completed: 0,
      total: 0,
      speed: 0,
      etaSeconds: null,
    });
    const { cancel } = pullOllamaModel(model, ollamaUrl, (event: PullEvent) => {
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
        setInstalled((prev) => (prev && !prev.includes(model) ? [...prev, model] : prev));
      } else if (event.type === "error") {
        setPullError(event.data.message ?? t("downloadFailed"));
        setPullState(null);
      }
    });
    pullCancelRef.current = cancel;
  };

  const handleCancel = () => {
    pullCancelRef.current?.();
    pullCancelRef.current = null;
    setPullState(null);
  };

  return (
    <ModelStatusInner
      modelName={model}
      modelInfo={modelInfo}
      installed={modelInstalled}
      reachable={reachable}
      pullState={pullState}
      pullError={pullError}
      onPull={handlePull}
      onCancel={handleCancel}
    />
  );
}

interface ModelStatusInnerProps {
  modelName: string;
  modelInfo?: OllamaModelInfo;
  installed: boolean;
  reachable: boolean | null;
  pullState: PullState | null;
  pullError: string | null;
  onPull: () => void;
  onCancel: () => void;
}

function ModelStatusInner({
  modelName,
  modelInfo,
  installed,
  reachable,
  pullState,
  pullError,
  onPull,
  onCancel,
}: ModelStatusInnerProps) {
  const t = useTranslations("ollamaStatus");
  const tc = useTranslations("common");
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span>
          {t.rich("installedReady", {
            model: modelName,
            b: (c) => <span className="font-medium">{c}</span>,
          })}
        </span>
      </div>
    );
  }

  if (pullState) {
    const percent =
      pullState.total > 0 ? Math.round((pullState.completed / pullState.total) * 100) : 0;
    const downloaded = formatBytes(pullState.completed);
    const total = formatBytes(pullState.total);
    const speed = pullState.speed > 0 ? `${formatBytes(pullState.speed)}/s` : "";
    const eta =
      pullState.etaSeconds != null && pullState.etaSeconds > 0
        ? formatDuration(pullState.etaSeconds)
        : "";
    return (
      <div className="space-y-2 rounded-md border bg-muted/30 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {pullState.status === "starting" ? t("startingDownload") : pullState.status}
          </span>
          <button
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {tc("cancel")}
          </button>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span>
            {downloaded} / {total} ({percent}%)
          </span>
          <span>
            {speed}
            {eta ? ` · ${t("etaLeft", { eta })}` : ""}
          </span>
        </div>
      </div>
    );
  }

  if (reachable === false) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">{t("notInstalledTitle")}</div>
            <p className="text-xs text-muted-foreground">{t("notInstalledBody")}</p>
          </div>
          <a
            href="https://ollama.com"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ size: "sm" })}
          >
            {t("getOllama")}
            <ExternalLink className="size-3.5" />
          </a>
        </div>
        <ol className="space-y-1 ps-5 text-xs text-muted-foreground list-decimal marker:text-muted-foreground/70">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
        </ol>
        <p className="text-xs text-destructive">{t("notReachable")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">{t("notInstalled")}</div>
          <p className="text-xs text-muted-foreground">
            {modelInfo
              ? t.rich("downloadPromptSized", {
                  model: modelName,
                  size: modelInfo.sizeGb,
                  b: (c) => <span className="font-medium">{c}</span>,
                })
              : t.rich("downloadPrompt", {
                  model: modelName,
                  b: (c) => <span className="font-medium">{c}</span>,
                })}
          </p>
        </div>
        <Button size="sm" onClick={onPull}>
          {t("download")}
        </Button>
      </div>
      {pullError && <p className="text-xs text-destructive">{pullError}</p>}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1);
  return `${(bytes / 1000 ** i).toFixed(i >= 2 ? 2 : 0)} ${units[i]}`;
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
