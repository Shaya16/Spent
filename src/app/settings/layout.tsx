import type { ReactNode } from "react";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import {
  SettingsSidebar,
  SettingsMobileNav,
} from "@/components/settings/settings-sidebar";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <PageHeader title="Settings" />
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
