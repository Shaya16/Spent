"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SlidersHorizontal,
  Palette,
  Landmark,
  Sparkles,
  Layers,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "General",
    items: [
      {
        href: "/settings/general",
        label: "General",
        Icon: SlidersHorizontal,
        match: (p) => p === "/settings/general" || p === "/settings",
      },
      {
        href: "/settings/appearance",
        label: "Appearance",
        Icon: Palette,
        match: (p) => p.startsWith("/settings/appearance"),
      },
    ],
  },
  {
    title: "Connections",
    items: [
      {
        href: "/settings/bank",
        label: "Bank accounts",
        Icon: Landmark,
        match: (p) => p.startsWith("/settings/bank"),
      },
      {
        href: "/settings/ai",
        label: "AI provider",
        Icon: Sparkles,
        match: (p) => p.startsWith("/settings/ai"),
      },
    ],
  },
  {
    title: "Categories",
    items: [
      {
        href: "/settings/categories",
        label: "Categories",
        Icon: Layers,
        match: (p) => p.startsWith("/settings/categories"),
      },
    ],
  },
  {
    title: "Advanced",
    items: [
      {
        href: "/settings/data",
        label: "Data & privacy",
        Icon: ShieldAlert,
        match: (p) => p.startsWith("/settings/data"),
      },
    ],
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border/40 bg-card/30 md:flex md:flex-col">
      <div className="px-5 pt-6 pb-3">
        <div className="font-serif text-xl leading-none tracking-tight">
          Settings
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Tune Spent to fit you.
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        {GROUPS.map((group) => (
          <div key={group.title} className="mt-3">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
              {group.title}
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
                          : "text-foreground/80 hover:bg-sidebar-accent/60 hover:text-foreground"
                      )}
                    >
                      <item.Icon className="h-4 w-4 shrink-0 opacity-80" />
                      <span className="truncate">{item.label}</span>
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
                  : "border-border/60 text-foreground/70 hover:border-border hover:text-foreground"
              )}
            >
              <item.Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
