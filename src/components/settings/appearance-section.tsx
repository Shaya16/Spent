"use client";

import { useTheme } from "next-themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { SectionShell, SettingCard } from "./section-shell";

const OPTIONS = [
  {
    value: "light" as const,
    label: "Light",
    description: "Cream background, dark text",
  },
  {
    value: "dark" as const,
    label: "Dark",
    description: "Warm dark background, light text",
  },
  {
    value: "system" as const,
    label: "System",
    description: "Follow your OS preference",
  },
];

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const hydrated = useIsHydrated();
  // Until hydration we don't know what theme is active (might be system,
  // might be a value persisted in localStorage). Render every card in its
  // neutral state on both server and the matching first client render to
  // avoid a mismatch, then flip the active one in.
  const active = hydrated ? (theme ?? "system") : null;

  return (
    <SectionShell
      title="Appearance"
      description="Choose how Spent looks. System matches your OS setting and updates automatically."
    >
      <SettingCard title="Theme">
        <div className="grid gap-2 sm:grid-cols-3">
          {OPTIONS.map((o) => {
            const isActive = active === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setTheme(o.value)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  isActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <div className="font-medium">{o.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {o.description}
                </div>
              </button>
            );
          })}
        </div>
      </SettingCard>

      <SettingCard title="Quick switch">
        <div className="flex items-center gap-3">
          <span className="text-sm">Current</span>
          <Select
            value={hydrated ? (theme ?? "system") : "system"}
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
