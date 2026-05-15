"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface CardShellProps {
  label?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function CardShell({ label, action, children, className }: CardShellProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-3xl border border-border bg-card p-5 md:p-6",
        className
      )}
    >
      {(label || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {label && (
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {label}
            </h3>
          )}
          {action && (
            <div className="text-xs text-muted-foreground">{action}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function CardAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="underline-offset-4 hover:text-foreground hover:underline"
    >
      {children}
    </Link>
  );
}

export function CardSkeleton({
  label,
  height = 140,
  className,
}: {
  label?: string;
  height?: number;
  className?: string;
}) {
  return (
    <CardShell label={label} className={className}>
      <Skeleton className="w-full" style={{ height }} />
    </CardShell>
  );
}

export function CardError({ label, className }: { label?: string; className?: string }) {
  return (
    <CardShell label={label} className={className}>
      <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
        Couldn&apos;t load this section.
      </div>
    </CardShell>
  );
}
