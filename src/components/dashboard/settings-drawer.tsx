"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getSettings,
  updateSettings,
  getSummary,
  updateBudget,
} from "@/lib/api";
import { getMonthRange } from "@/lib/formatters";
import { toast } from "sonner";
import type { AppSettings, CategoryWithData } from "@/lib/types";

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
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">Settings</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-80px)] pr-4">
          {settings ? (
            <SettingsForm
              key={
                settings.aiProvider +
                settings.monthsToSync +
                settings.paydayDay
              }
              initial={settings}
            />
          ) : (
            <div className="p-6 text-sm text-muted-foreground">Loading...</div>
          )}
        </ScrollArea>
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
  const [paydayDay, setPaydayDay] = useState(String(initial.paydayDay));

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
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
      paydayDay: Number(paydayDay),
    });
  };

  return (
    <div className="mt-6 space-y-6 pb-6">
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

      <ThemeSelect />

      <div className="space-y-2">
        <Label>Payday (day of month)</Label>
        <Select
          value={paydayDay}
          onValueChange={(v) => v && setPaydayDay(v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <SelectItem key={d} value={String(d)}>
                {ordinal(d)} of the month
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Powers the &quot;days until payday&quot; copy on the dashboard.
        </p>
      </div>

      <Separator />

      <BudgetEditor />

      <Separator />

      <div className="space-y-3">
        <Label>AI Provider</Label>
        <Select
          value={aiProvider}
          onValueChange={(v) =>
            v && setAiProvider(v as AppSettings["aiProvider"])
          }
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
        href="/setup?force=1"
        className="block text-center text-sm text-muted-foreground hover:text-foreground"
      >
        Re-run setup wizard
      </a>
    </div>
  );
}

function BudgetEditor() {
  const queryClient = useQueryClient();
  const { from, to } = getMonthRange();
  const { data: summary } = useQuery({
    queryKey: ["summary", from, to],
    queryFn: () => getSummary({ from, to }),
  });

  const mutation = useMutation({
    mutationFn: ({
      categoryId,
      amount,
    }: {
      categoryId: number;
      amount: number | null;
    }) => updateBudget(categoryId, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  if (!summary) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Category budgets</Label>
        <p className="text-xs text-muted-foreground">
          Auto-set from last month&apos;s actual spending. Tap to override.
        </p>
      </div>
      <div className="space-y-2">
        {summary.categoriesWithData
          .filter((c) => c.spent > 0 || !c.isAutoBudget)
          .sort((a, b) => b.spent - a.spent)
          .map((cat) => (
            <BudgetRow
              key={cat.categoryId}
              category={cat}
              onChange={(amount) =>
                mutation.mutate({ categoryId: cat.categoryId, amount })
              }
            />
          ))}
      </div>
    </div>
  );
}

function BudgetRow({
  category,
  onChange,
}: {
  category: CategoryWithData;
  onChange: (amount: number | null) => void;
}) {
  const [value, setValue] = useState(String(Math.round(category.budget)));

  const handleBlur = () => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    if (Math.round(parsed) === Math.round(category.budget)) return;
    onChange(parsed);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: category.categoryColor }}
        />
        <span className="truncate text-sm">{category.categoryName}</span>
        {category.isAutoBudget && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            auto
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">₪</span>
        <Input
          type="number"
          className="h-8 w-24 text-right tabular-nums"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          min={0}
        />
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="space-y-2" suppressHydrationWarning>
      <Label>Appearance</Label>
      <Select value={theme ?? "system"} onValueChange={(v) => v && setTheme(v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="light">Light</SelectItem>
          <SelectItem value="dark">Dark</SelectItem>
          <SelectItem value="system">Follow system</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
