"use client";

import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
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
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 md:min-h-16 md:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="-ms-1 md:hidden" />
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {meta && (
            <>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="truncate text-sm text-muted-foreground">{meta}</span>
            </>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
