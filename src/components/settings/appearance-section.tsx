"use client";

import { useTheme } from "next-themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionShell, SettingCard } from "./section-shell";

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <SectionShell
      title="Appearance"
      description="Choose how Spent looks. System matches your OS setting and updates automatically."
    >
      <SettingCard title="Theme">
        <div className="grid gap-2 sm:grid-cols-3" suppressHydrationWarning>
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                (theme ?? "system") === t
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="font-medium capitalize">{t}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t === "system"
                  ? "Follow your OS preference"
                  : t === "light"
                    ? "Cream background, dark text"
                    : "Warm dark background, light text"}
              </div>
            </button>
          ))}
        </div>
      </SettingCard>

      <SettingCard title="Quick switch">
        <div className="flex items-center gap-3" suppressHydrationWarning>
          <span className="text-sm">Current</span>
          <Select
            value={theme ?? "system"}
            onValueChange={(v) => v && setTheme(v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">Follow system</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SettingCard>
    </SectionShell>
  );
}
