import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Dashboard } from "@/components/dashboard/dashboard";
import { AppShell } from "@/components/layout/app-shell";
import { anyWorkspaceHasBankCredentials } from "@/server/db/queries/bank-credentials";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("budget") };
}

export default async function BudgetPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!anyWorkspaceHasBankCredentials()) {
    const { locale } = await params;
    redirect(`/${locale}/setup`);
  }

  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
