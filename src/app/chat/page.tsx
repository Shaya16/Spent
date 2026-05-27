import { redirect } from "next/navigation";
import { ChatClient } from "@/components/chat/chat-client";
import { ChatDisabled } from "@/components/chat/chat-disabled";
import { AppShell } from "@/components/layout/app-shell";
import { getDb } from "@/server/db/index";
import { getAppSettings } from "@/server/db/queries/settings";

export const dynamic = "force-dynamic";

function anyWorkspaceHasBank(): boolean {
  const row = getDb().prepare("SELECT COUNT(*) as count FROM bank_credentials").get() as {
    count: number;
  };
  return row.count > 0;
}

function firstWorkspaceId(): number {
  const row = getDb().prepare("SELECT id FROM workspaces ORDER BY id LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (!row) throw new Error("No workspace exists");
  return row.id;
}

export default function ChatPage() {
  if (!anyWorkspaceHasBank()) {
    redirect("/setup");
  }

  const settings = getAppSettings(firstWorkspaceId());
  const enabled = settings.aiProvider !== "none";

  return <AppShell>{enabled ? <ChatClient /> : <ChatDisabled />}</AppShell>;
}
