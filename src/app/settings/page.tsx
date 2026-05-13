import { redirect } from "next/navigation";
import { hasBankCredentials } from "@/server/db/queries/bank-credentials";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsShell } from "@/components/settings/settings-shell";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  if (!hasBankCredentials()) {
    redirect("/setup");
  }
  return (
    <AppShell>
      <SettingsShell />
    </AppShell>
  );
}
