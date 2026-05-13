"use client";

import { useState } from "react";
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
import { saveAIConfig } from "@/lib/api";

type AIChoice = "claude" | "ollama" | "none";

interface AIStepProps {
  onComplete: () => void;
}

export function AIStep({ onComplete }: AIStepProps) {
  const [choice, setChoice] = useState<AIChoice | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("llama3.1");
  const [saving, setSaving] = useState(false);

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

  const canProceed =
    choice === "none" ||
    (choice === "claude" && apiKey.trim()) ||
    (choice === "ollama" && ollamaUrl.trim() && ollamaModel.trim());

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Categorization</CardTitle>
        <CardDescription>
          Choose how to auto-categorize your transactions. You can change this
          later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          <OptionCard
            selected={choice === "claude"}
            onSelect={() => setChoice("claude")}
            title="Claude (Anthropic)"
            description="Fast, accurate categorization via the Claude API. Requires an API key."
          />
          <OptionCard
            selected={choice === "ollama"}
            onSelect={() => setChoice("ollama")}
            title="Ollama (Local)"
            description="Run AI locally with Ollama. Free, private, requires Ollama installed."
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
              Your key is encrypted and stored locally.
            </p>
          </div>
        )}

        {choice === "ollama" && (
          <div className="space-y-3 pt-2">
            <div className="space-y-2">
              <Label htmlFor="ollamaUrl">Ollama URL</Label>
              <Input
                id="ollamaUrl"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ollamaModel">Model name</Label>
              <Input
                id="ollamaModel"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                placeholder="llama3.1"
              />
              <p className="text-xs text-muted-foreground">
                Make sure the model is pulled in Ollama first.
              </p>
            </div>
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleSave}
          disabled={!canProceed || saving}
        >
          {saving ? "Saving..." : "Continue"}
        </Button>
      </CardContent>
    </Card>
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
