import { redirect } from "next/navigation";
import { getDb } from "@/server/db/index";
import { AppShell } from "@/components/layout/app-shell";
import { TransactionsPage } from "@/components/transactions/transactions-page";

export const dynamic = "force-dynamic";

function anyWorkspaceHasBank(): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM bank_credentials")
    .get() as { count: number };
  return row.count > 0;
}

export default function Transactions() {
  if (!anyWorkspaceHasBank()) {
    redirect("/setup");
  }
  return (
    <AppShell>
      <TransactionsPage />
    </AppShell>
  );
}
