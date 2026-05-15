import { redirect } from "next/navigation";
import { getDb } from "@/server/db/index";
import { SetupWizard } from "@/components/setup/setup-wizard";

export const dynamic = "force-dynamic";

interface SetupPageProps {
  searchParams: Promise<{ force?: string; mode?: string }>;
}

function anyWorkspaceHasBank(): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM bank_credentials")
    .get() as { count: number };
  return row.count > 0;
}

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const { force, mode } = await searchParams;

  const newWorkspaceMode = mode === "new-workspace";

  if (!newWorkspaceMode && force !== "1" && anyWorkspaceHasBank()) {
    redirect("/");
  }

  return <SetupWizard mode={newWorkspaceMode ? "new-workspace" : "first-run"} />;
}
