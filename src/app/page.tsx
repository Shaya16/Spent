import { redirect } from "next/navigation";
import { HomePage } from "@/components/home/home-page";
import { AppShell } from "@/components/layout/app-shell";
import { getDb } from "@/server/db/index";

export const dynamic = "force-dynamic";

function anyWorkspaceHasBank(): boolean {
  const row = getDb().prepare("SELECT COUNT(*) as count FROM bank_credentials").get() as {
    count: number;
  };
  return row.count > 0;
}

export default function Home() {
  if (!anyWorkspaceHasBank()) {
    redirect("/setup");
  }

  return (
    <AppShell>
      <HomePage />
    </AppShell>
  );
}
