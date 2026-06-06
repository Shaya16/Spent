import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { TransactionsPage } from "@/components/transactions/transactions-page";
import { anyWorkspaceHasBankCredentials } from "@/server/db/queries/bank-credentials";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("transactions") };
}

export default async function Transactions({ params }: { params: Promise<{ locale: string }> }) {
  if (!anyWorkspaceHasBankCredentials()) {
    const { locale } = await params;
    redirect(`/${locale}/setup`);
  }
  return (
    <AppShell>
      <TransactionsPage />
    </AppShell>
  );
}
