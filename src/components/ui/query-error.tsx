"use client";

import { RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shown when a data query fails, so a failed fetch never masquerades as an
 * innocent empty state. Offers a retry. See design.md (UX states).
 */
export function QueryError({
  onRetry,
  message,
  className,
}: {
  onRetry?: () => void;
  message?: string;
  className?: string;
}) {
  const t = useTranslations("common");
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-8 text-center",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{message ?? t("loadFailed")}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw className="size-3.5" aria-hidden />
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
