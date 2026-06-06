import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { SettingsMobileNav, SettingsSidebar } from "@/components/settings/settings-sidebar";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("settings") };
}

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("settings");
  return (
    <AppShell>
      <PageHeader title={t("pageTitle")} />
      <div className="flex min-h-[calc(100vh-4rem)] flex-1">
        <SettingsSidebar />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
            <SettingsMobileNav />
            {children}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
