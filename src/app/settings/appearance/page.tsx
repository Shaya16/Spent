"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { SectionShell, SettingCard } from "@/components/settings/section-shell";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { getSettings, updateSettings } from "@/lib/api";
import type { AppSettings } from "@/lib/types";

type Lang = "en" | "he";

export default function AppearanceSettingsPage() {
  const t = useTranslations("settings.appearance");
  const tCommon = useTranslations("common");
  const { theme, setTheme } = useTheme();
  const hydrated = useIsHydrated();
  const active = hydrated ? (theme ?? "system") : null;

  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = useLocale() as Lang;

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const storedLang: Lang = settings?.language ?? locale;

  const mutation = useMutation({
    mutationFn: (next: Lang) => updateSettings({ language: next } as Partial<AppSettings>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(tCommon("saved"));
      router.refresh();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : tCommon("tryAgain"));
    },
  });

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
            const isActive = storedLang === o.value;
            const isPending = mutation.isPending && mutation.variables === o.value;
            return (
              <button
                key={o.value}
                onClick={() => {
                  if (storedLang === o.value || mutation.isPending) return;
                  mutation.mutate(o.value);
                }}
                disabled={mutation.isPending}
                className={`rounded-xl border p-4 text-start transition-colors ${
                  isActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                } disabled:opacity-60`}
              >
                <div className="font-medium" dir={o.value === "he" ? "rtl" : "ltr"}>
                  {o.label}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {isPending ? t("languageSaving") : o.description}
                </div>
              </button>
            );
          })}
        </div>
      </SettingCard>
    </SectionShell>
  );
}
