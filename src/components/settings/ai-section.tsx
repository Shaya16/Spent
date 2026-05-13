"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RECOMMENDED_OLLAMA_MODELS, type AppSettings } from "@/lib/types";
import { getSettings, saveAIConfig } from "@/lib/api";
import { OllamaModelStatus } from "./ollama-model-status";
import { SectionShell, SettingCard } from "./section-shell";
import { toast } from "sonner";

export function AISection() {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  if (!settings) {
    return (
      <SectionShell title="AI">
        <SettingCard>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </SettingCard>
      </SectionShell>
    );
  }
  return (
    <SectionShell
      title="AI"
      description="Spent uses AI to auto-categorize new transactions on every sync. Pick a provider, or skip it entirely."
    >
      <AIForm key={settings.aiProvider} settings={settings} />
    </SectionShell>
  );
}

function AIForm({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<AppSettings["aiProvider"]>(
    settings.aiProvider
  );
  const [apiKey, setApiKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollamaUrl);
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel);

  const mutation = useMutation({
    mutationFn: () =>
      saveAIConfig({
        provider,
        apiKey: provider === "claude" && apiKey ? apiKey : undefined,
        ollamaUrl: provider === "ollama" ? ollamaUrl : undefined,
        ollamaModel: provider === "ollama" ? ollamaModel : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("AI settings saved");
      setApiKey("");
    },
  });

  return (
    <>
      <SettingCard
        title="Provider"
        description="Switch any time. Your existing categorizations are kept."
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              {
                id: "claude",
                title: "Claude (Anthropic)",
                desc: "Fast and accurate. Paid API. Bring your own API key.",
              },
              {
                id: "ollama",
                title: "Ollama (Local)",
                desc: "Free, private, runs on your machine. Needs a model download.",
              },
              {
                id: "none",
                title: "None",
                desc: "Skip categorization. Assign categories manually.",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setProvider(opt.id)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                provider === opt.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="font-medium">{opt.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {opt.desc}
              </div>
            </button>
          ))}
        </div>
      </SettingCard>

      {provider === "claude" && (
        <SettingCard
          title="Claude API key"
          description="Paste your key from console.anthropic.com. It's encrypted at rest with AES-256-GCM."
        >
          <div className="space-y-2">
            <Label htmlFor="claude-key">API key</Label>
            <Input
              id="claude-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to keep your existing key.
            </p>
          </div>
        </SettingCard>
      )}

      {provider === "ollama" && (
        <SettingCard
          title="Ollama configuration"
          description="Spent auto-starts Ollama if it's installed but not running."
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ollama-url">Ollama URL</Label>
              <Input
                id="ollama-url"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
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
              <p className="text-xs text-muted-foreground">
                {
                  RECOMMENDED_OLLAMA_MODELS.find((m) => m.name === ollamaModel)
                    ?.description
                }
              </p>
            </div>
            <OllamaModelStatus ollamaUrl={ollamaUrl} model={ollamaModel} />
          </div>
        </SettingCard>
      )}

      <div className="flex justify-end">
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Saving..." : "Save AI settings"}
        </Button>
      </div>
    </>
  );
}
