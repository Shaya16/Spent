import { redirect } from "next/navigation";
import { anyWorkspaceHasBankCredentials } from "@/server/db/queries/bank-credentials";

export const dynamic = "force-dynamic";

export default async function SettingsRoot({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!anyWorkspaceHasBankCredentials()) {
    redirect(`/${locale}/setup`);
  }
  redirect(`/${locale}/settings/general`);
}
