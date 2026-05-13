import { redirect } from "next/navigation";
import { hasBankCredentials } from "@/server/db/queries/bank-credentials";
import { AppShell } from "@/components/layout/app-shell";
import { TransactionsPage } from "@/components/transactions/transactions-page";

export const dynamic = "force-dynamic";

export default function Transactions() {
  if (!hasBankCredentials()) {
    redirect("/setup");
  }
  return (
    <AppShell>
      <TransactionsPage />
    </AppShell>
  );
}
