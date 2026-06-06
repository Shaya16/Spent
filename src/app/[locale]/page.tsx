import { redirect } from "next/navigation";
import { HomePage } from "@/components/home/home-page";
import { AppShell } from "@/components/layout/app-shell";
import { anyWorkspaceHasBankCredentials } from "@/server/db/queries/bank-credentials";

export const dynamic = "force-dynamic";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  if (!anyWorkspaceHasBankCredentials()) {
    const { locale } = await params;
    redirect(`/${locale}/setup`);
  }

  return (
    <AppShell>
      <HomePage />
    </AppShell>
  );
}
