"use client";

import { Landmark, Layers, Palette, ShieldAlert, SlidersHorizontal, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
}

interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    titleKey: "groupGeneral",
    items: [
      {
        href: "/settings/general",
        labelKey: "general",
        Icon: SlidersHorizontal,
        match: (p) => p === "/settings/general" || p === "/settings",
      },
      {
        href: "/settings/appearance",
        labelKey: "appearance",
        Icon: Palette,
        match: (p) => p.startsWith("/settings/appearance"),
      },
    ],
  },
  {
    titleKey: "groupConnections",
    items: [
      {
        href: "/settings/bank",
        labelKey: "bank",
        Icon: Landmark,
        match: (p) => p.startsWith("/settings/bank"),
      },
      {
        href: "/settings/ai",
        labelKey: "ai",
        Icon: Sparkles,
        match: (p) => p.startsWith("/settings/ai"),
      },
    ],
  },
  {
    titleKey: "groupCategories",
    items: [
      {
        href: "/settings/categories",
        labelKey: "categories",
        Icon: Layers,
        match: (p) => p.startsWith("/settings/categories"),
      },
    ],
  },
  {
    titleKey: "groupAdvanced",
    items: [
      {
        href: "/settings/data",
        labelKey: "data",
        Icon: ShieldAlert,
        match: (p) => p.startsWith("/settings/data"),
      },
    ],
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  const t = useTranslations("settings.sidebar");
  return (
    <aside className="hidden w-56 shrink-0 border-e border-border/40 bg-card/30 md:flex md:flex-col">
      <div className="px-5 pt-6 pb-3">
        <div className="font-serif text-xl leading-none tracking-tight">{t("title")}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">{t("subtitle")}</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        {GROUPS.map((group) => (
          <div key={group.titleKey} className="mt-3">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
              {t(group.titleKey)}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.match(pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-foreground/80 hover:bg-sidebar-accent/60 hover:text-foreground",
                      )}
                    >
                      <item.Icon className="h-4 w-4 shrink-0 opacity-80" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function SettingsMobileNav() {
  const pathname = usePathname();
  const t = useTranslations("settings.sidebar");
  const allItems = GROUPS.flatMap((g) => g.items);
  return (
    <div className="-mx-4 overflow-x-auto border-b border-border/40 px-4 md:hidden">
      <div className="flex gap-1 pb-3 pt-1">
        {allItems.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/60 text-foreground/70 hover:border-border hover:text-foreground",
              )}
            >
              <item.Icon className="h-3.5 w-3.5" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
