import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
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
      <div className="flex h-16 items-center justify-between gap-4 px-6 md:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-2xl tracking-tight">{title}</h1>
          {meta && (
            <>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground">{meta}</span>
            </>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}
