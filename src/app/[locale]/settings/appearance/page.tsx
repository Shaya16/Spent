"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { SectionShell, SettingCard } from "@/components/settings/section-shell";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { usePathname, useRouter } from "@/i18n/navigation";

type Lang = "en" | "he";

export default function AppearanceSettingsPage() {
  const t = useTranslations("settings.appearance");
  const { theme, setTheme } = useTheme();
  const hydrated = useIsHydrated();
  const active = hydrated ? (theme ?? "system") : null;

  const router = useRouter();
  const pathname = usePathname();
  // The active language lives in the URL (/en, /he); next-intl persists the
  // choice to the NEXT_LOCALE cookie on navigation. No database involved.
  const locale = useLocale() as Lang;

  const themeOptions = [
    { value: "light" as const, label: t("themeLight"), description: t("themeLightDesc") },
    { value: "dark" as const, label: t("themeDark"), description: t("themeDarkDesc") },
    { value: "system" as const, label: t("themeSystem"), description: t("themeSystemDesc") },
  ];

  const langOptions: { value: Lang; label: string; description: string }[] = [
    { value: "en", label: t("languageEnglish"), description: t("languageEnglishDesc") },
    { value: "he", label: t("languageHebrew"), description: t("languageHebrewDesc") },
  ];

  return (
    <SectionShell title={t("title")} description={t("description")}>
      <SettingCard title={t("themeCardTitle")}>
        <div className="grid gap-2 sm:grid-cols-3">
          {themeOptions.map((o) => {
            const isActive = active === o.value;
            return (
              <button
                key={o.value}
                onClick={() => setTheme(o.value)}
                className={`rounded-xl border p-4 text-start transition-colors ${
                  isActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <div className="font-medium">{o.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{o.description}</div>
              </button>
            );
          })}
        </div>
      </SettingCard>

      <SettingCard title={t("languageCardTitle")} description={t("languageCardDescription")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {langOptions.map((o) => {
            const isActive = locale === o.value;
            return (
              <button
                key={o.value}
                onClick={() => {
                  if (locale !== o.value) router.replace(pathname, { locale: o.value });
                }}
                className={`rounded-xl border p-4 text-start transition-colors ${
                  isActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <div className="font-medium" dir={o.value === "he" ? "rtl" : "ltr"}>
                  {o.label}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{o.description}</div>
              </button>
            );
          })}
        </div>
      </SettingCard>
    </SectionShell>
  );
}
