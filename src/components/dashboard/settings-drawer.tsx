"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { getSettings, updateSettings } from "@/lib/api";
import { toast } from "sonner";
import type { AppSettings } from "@/lib/types";

export function SettingsDrawer() {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  return (
    <Sheet>
      <SheetTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>
        {settings ? (
          <SettingsForm key={settings.aiProvider + settings.monthsToSync} initial={settings} />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Loading...</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SettingsForm({ initial }: { initial: AppSettings }) {
  const queryClient = useQueryClient();
  const [months, setMonths] = useState(String(initial.monthsToSync));
  const [aiProvider, setAiProvider] = useState(initial.aiProvider);
  const [ollamaUrl, setOllamaUrl] = useState(initial.ollamaUrl);
  const [ollamaModel, setOllamaModel] = useState(initial.ollamaModel);
  const [showBrowser, setShowBrowser] = useState(initial.showBrowser);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
    },
  });

  const handleSave = () => {
    mutation.mutate({
      monthsToSync: Number(months),
      aiProvider: aiProvider as "claude" | "ollama" | "none",
      ollamaUrl,
      ollamaModel,
      showBrowser,
    });
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="space-y-2">
        <Label>Months to sync</Label>
        <Select value={months} onValueChange={(v) => v && setMonths(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 6, 12].map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m} {m === 1 ? "month" : "months"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label>AI Provider</Label>
        <Select
          value={aiProvider}
          onValueChange={(v) => v && setAiProvider(v as AppSettings["aiProvider"])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="claude">Claude (Anthropic)</SelectItem>
            <SelectItem value="ollama">Ollama (Local)</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>

        {aiProvider === "ollama" && (
          <>
            <div className="space-y-2">
              <Label>Ollama URL</Label>
              <Input
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <Separator />

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="show-browser">Show browser during sync</Label>
          <p className="text-xs text-muted-foreground">
            Opens a visible Chromium window so you can watch the scrape happen.
            Useful for debugging.
          </p>
        </div>
        <Switch
          id="show-browser"
          checked={showBrowser}
          onCheckedChange={setShowBrowser}
        />
      </div>

      <Separator />

      <Button onClick={handleSave} className="w-full">
        Save Settings
      </Button>

      <a
        href="/setup"
        className="block text-center text-sm text-muted-foreground hover:text-foreground"
      >
        Re-run setup wizard
      </a>
    </div>
  );
}
