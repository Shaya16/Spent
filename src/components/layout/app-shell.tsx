"use client";

import { useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "./app-sidebar";
import { ChatDrawer } from "@/components/chat/chat-drawer";
import { useChatStatus } from "@/hooks/use-chat";

export function AppShell({ children }: { children: ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {children}
        <AssistantFab open={chatOpen} onOpen={() => setChatOpen(true)} />
      </SidebarInset>
      <ChatDrawer open={chatOpen} onOpenChange={setChatOpen} />
    </SidebarProvider>
  );
}

function AssistantFab({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  // We still render the FAB while the drawer is open (Sheet uses its own
  // overlay) so the user always sees the entry point on every page.
  const status = useChatStatus();
  // Hide the FAB outright when the provider is Ollama or none, so users with
  // a tools-incompatible setup don't see a dead button. They can still reach
  // /settings/ai through the sidebar.
  if (status.data && !status.data.available && status.data.provider !== "claude" && status.data.provider !== "openai") {
    return null;
  }
  return (
    <Button
      onClick={onOpen}
      aria-label="Open Spent Assistant"
      className="fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full shadow-lg ring-1 ring-foreground/10 hover:shadow-xl"
      size="icon"
      data-state={open ? "open" : "closed"}
    >
      <Sparkles className="h-5 w-5" />
    </Button>
  );
}

export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-4 px-4 md:h-16 md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="-ml-1 md:hidden" />
          <h1 className="truncate font-serif text-2xl leading-none tracking-tight">
            {title}
          </h1>
          {meta && (
            <>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="truncate text-sm text-muted-foreground">
                {meta}
              </span>
            </>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
