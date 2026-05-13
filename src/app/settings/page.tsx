import { redirect } from "next/navigation";
import { hasBankCredentials } from "@/server/db/queries/bank-credentials";
import { SettingsShell } from "@/components/settings/settings-shell";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  // If never configured, send the user through the wizard first.
  if (!hasBankCredentials()) {
    redirect("/setup");
  }
  return <SettingsShell />;
}
