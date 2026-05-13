"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getSettings, updateSettings } from "@/lib/api";
import { toast } from "sonner";
import { SectionShell, SettingCard } from "./section-shell";

export function PrivacySection() {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  if (!settings) {
    return (
      <SectionShell title="Data & privacy">
        <SettingCard>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </SettingCard>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Data & privacy"
      description="Spent runs locally. Your credentials are encrypted at rest and never leave your machine."
    >
      <ShowBrowserCard initial={settings.showBrowser} />
      <SettingCard
        title="How your data is stored"
        description={
          "Bank credentials and your Claude API key are encrypted with AES-256-GCM. The encryption key lives at data/.encryption-key on your machine (gitignored) and is auto-generated on first run. All transaction data lives in data/spent.db. To reset everything, stop the dev server and delete the data/ directory."
        }
      >
        <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <code>data/spent.db</code> · <code>data/.encryption-key</code>
        </div>
      </SettingCard>
    </SectionShell>
  );
}

function ShowBrowserCard({ initial }: { initial: boolean }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initial);
  const mutation = useMutation({
    mutationFn: (value: boolean) => updateSettings({ showBrowser: value }),
    onSuccess: (_, value) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(
        value
          ? "Browser will be visible on next sync"
          : "Browser will stay hidden"
      );
    },
  });

  const handleToggle = (value: boolean) => {
    setEnabled(value);
    mutation.mutate(value);
  };

  return (
    <SettingCard>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="show-browser-toggle">Show browser during sync</Label>
          <p className="text-xs text-muted-foreground">
            Opens a visible Chromium window so you can watch the scrape happen
            (useful for debugging or solving 2FA / captcha challenges).
            Also enables verbose scraper logs in your dev terminal.
          </p>
        </div>
        <Switch
          id="show-browser-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
        />
      </div>
    </SettingCard>
  );
}
