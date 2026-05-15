"use client";

import { useTheme } from "next-themes";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { SectionShell, SettingCard } from "@/components/settings/section-shell";

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

export default function AppearanceSettingsPage() {
  const { theme, setTheme } = useTheme();
  const hydrated = useIsHydrated();
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
    </SectionShell>
  );
}
