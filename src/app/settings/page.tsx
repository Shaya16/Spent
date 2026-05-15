import { redirect } from "next/navigation";
import { getDb } from "@/server/db/index";

export const dynamic = "force-dynamic";

function anyWorkspaceHasBank(): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM bank_credentials")
    .get() as { count: number };
  return row.count > 0;
}

export default function SettingsRoot() {
  if (!anyWorkspaceHasBank()) {
    redirect("/setup");
  }
  redirect("/settings/general");
}
