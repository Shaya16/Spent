import type { ReactNode } from "react";

interface SectionShellProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SectionShell({
  title,
  description,
  children,
}: SectionShellProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

interface SettingCardProps {
  title?: string;
  description?: string;
  children: ReactNode;
}

export function SettingCard({
  title,
  description,
  children,
}: SettingCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      {(title || description) && (
        <div className="mb-4">
          {title && <h3 className="font-medium">{title}</h3>}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
