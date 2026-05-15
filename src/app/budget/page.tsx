import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/components/dashboard/dashboard";
import { getDb } from "@/server/db/index";

export const dynamic = "force-dynamic";

function anyWorkspaceHasBank(): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM bank_credentials")
    .get() as { count: number };
  return row.count > 0;
}

export default function BudgetPage() {
  if (!anyWorkspaceHasBank()) {
    redirect("/setup");
  }

  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
