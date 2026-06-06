"use client";

import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getSettings } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AINotConnectedBannerProps {
  className?: string;
}

export function AINotConnectedBanner({ className }: AINotConnectedBannerProps) {
  const t = useTranslations("aiBanner");
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    staleTime: 60_000,
  });

  if (!data || data.aiProvider !== "none") return null;

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5",
        className,
      )}
      style={{
        background: "color-mix(in oklch, var(--status-heads-up) 14%, var(--card))",
        borderColor: "color-mix(in oklch, var(--status-heads-up) 35%, var(--border))",
      }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in oklch, var(--status-heads-up) 28%, var(--card))",
          color: "var(--status-heads-up)",
        }}
      >
        <Sparkles className="h-5 w-5" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="font-serif text-base leading-tight tracking-tight">{t("notConnected")}</div>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <Button
        size="sm"
        nativeButton={false}
        className="self-start sm:self-auto"
        render={<Link href="/settings/ai">{t("connectAi")}</Link>}
      />
    </div>
  );
}
