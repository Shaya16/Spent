"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
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
import { getSettings, saveAIConfig } from "@/lib/api";
import {
  type AppSettings,
  RECOMMENDED_GEMINI_MODELS,
  RECOMMENDED_OLLAMA_MODELS,
} from "@/lib/types";
import { OllamaModelStatus } from "./ollama-model-status";
import { SectionShell, SettingCard } from "./section-shell";

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

function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Request failed";
  try {
    const parsed = JSON.parse(err.message) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {}
  return err.message;
}

export function AISection() {
  const t = useTranslations("settings.ai");
  const tCommon = useTranslations("common");
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  if (!settings) {
    return (
      <SectionShell title={t("title")}>
        <SettingCard>
          <div className="text-sm text-muted-foreground">{tCommon("loading")}</div>
        </SettingCard>
      </SectionShell>
    );
  }
  return (
    <SectionShell title={t("title")} description={t("description")}>
      <AIForm key={settings.aiProvider} settings={settings} />
    </SectionShell>
  );
}

function AIForm({ settings }: { settings: AppSettings }) {
  const t = useTranslations("settings.ai");
  const tCommon = useTranslations("common");
  const tModels = useTranslations("ollamaModels");
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<AppSettings["aiProvider"]>(settings.aiProvider);
  const [apiKey, setApiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel);
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollamaUrl);
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel);
  const missingKey = (provider === "claude" && !apiKey) || (provider === "gemini" && !geminiKey);

  const mutation = useMutation({
    mutationFn: () =>
      saveAIConfig({
        provider,
        claudeApiKey: provider === "claude" && apiKey ? apiKey : undefined,
        geminiApiKey: provider === "gemini" && geminiKey ? geminiKey : undefined,
        geminiModel: provider === "gemini" ? geminiModel : undefined,
        ollamaUrl: provider === "ollama" ? ollamaUrl : undefined,
        ollamaModel: provider === "ollama" ? ollamaModel : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(t("aiSettingsSaved"));
      setApiKey("");
      setGeminiKey("");
    },
    onError: (err) => {
      toast.error(errorMessage(err));
    },
  });

  return (
    <>
      <SettingCard title={t("providerCardTitle")} description={t("providerCardDescription")}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              id: "claude" as const,
              title: t("providerClaudeTitle"),
              desc: t("providerClaudeDesc"),
            },
            {
              id: "gemini" as const,
              title: t("providerGeminiTitle"),
              desc: t("providerGeminiDesc"),
            },
            {
              id: "ollama" as const,
              title: t("providerOllamaTitle"),
              desc: t("providerOllamaDesc"),
            },
            {
              id: "none" as const,
              title: t("providerNoneTitle"),
              desc: t("providerNoneDesc"),
            },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setProvider(opt.id)}
              className={`rounded-xl border p-4 text-start transition-colors ${
                provider === opt.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="font-medium">{opt.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{opt.desc}</div>
            </button>
          ))}
        </div>
      </SettingCard>

      {provider === "claude" && (
        <SettingCard title={t("claudeKeyCardTitle")} description={t("claudeKeyCardDescription")}>
          <div className="space-y-2">
            <Label htmlFor="claude-key">{t("apiKeyLabel")}</Label>
            <Input
              id="claude-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
            />
            <p className="text-xs text-muted-foreground">{t("apiKeyRequiredHint")}</p>
          </div>
        </SettingCard>
      )}

      {provider === "gemini" && (
        <SettingCard title={t("geminiKeyCardTitle")} description={t("geminiKeyCardDescription")}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gemini-key">{t("apiKeyLabel")}</Label>
              <Input
                id="gemini-key"
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIza..."
              />
              <p className="text-xs text-muted-foreground">{t("apiKeyRequiredHint")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("modelLabel")}</Label>
              <Select value={geminiModel} onValueChange={(v) => v && setGeminiModel(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {RECOMMENDED_GEMINI_MODELS.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.recommended ? `${m.name} (${t("recommendedTag")})` : m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {RECOMMENDED_GEMINI_MODELS.find((m) => m.name === geminiModel)?.description ??
                  t("geminiModelDescription")}
              </p>
            </div>
          </div>
        </SettingCard>
      )}

      {provider === "ollama" && (
        <SettingCard title={t("ollamaCardTitle")} description={t("ollamaCardDescription")}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ollama-url">{t("ollamaUrlLabel")}</Label>
              <Input
                id="ollama-url"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("modelLabel")}</Label>
              <Select value={ollamaModel} onValueChange={(v) => v && setOllamaModel(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {RECOMMENDED_OLLAMA_MODELS.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      <div className="flex items-center gap-2">
                        <span>{m.name}</span>
                        <span className="text-xs text-muted-foreground">{m.sizeGb} GB</span>
                        {m.recommended && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                            {t("recommendedTag")}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const m = RECOMMENDED_OLLAMA_MODELS.find((m) => m.name === ollamaModel);
                  return m ? ollamaModelDescription(m.name, m.description, tModels) : "";
                })()}
              </p>
            </div>
            <OllamaModelStatus ollamaUrl={ollamaUrl} model={ollamaModel} />
          </div>
        </SettingCard>
      )}

      <div className="flex justify-end">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || missingKey}>
          {mutation.isPending ? tCommon("saving") : t("saveAiSettings")}
        </Button>
      </div>
    </>
  );
}
