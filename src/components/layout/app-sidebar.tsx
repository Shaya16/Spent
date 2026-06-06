"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  LayoutDashboard,
  Settings as SettingsIcon,
  Sparkles,
  Star,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Link, usePathname } from "@/i18n/navigation";
import { getSettings } from "@/lib/api";
import { GITHUB_REPO_URL } from "@/lib/constants";
import { WorkspaceSwitcher } from "./workspace-switcher";

interface NavDef {
  href: string;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
}

const NAV: NavDef[] = [
  {
    href: "/",
    labelKey: "home",
    Icon: LayoutDashboard,
    match: (p: string) => p === "/",
  },
  {
    href: "/budget",
    labelKey: "budget",
    Icon: Wallet,
    match: (p: string) => p.startsWith("/budget"),
  },
  {
    href: "/transactions",
    labelKey: "transactions",
    Icon: ArrowLeftRight,
    match: (p: string) => p.startsWith("/transactions"),
  },
  {
    href: "/chat",
    labelKey: "chat",
    Icon: Sparkles,
    match: (p: string) => p.startsWith("/chat"),
  },
];

const FOOTER_NAV: NavDef[] = [
  {
    href: "/settings",
    labelKey: "settings",
    Icon: SettingsIcon,
    match: (p: string) => p.startsWith("/settings"),
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    staleTime: 60_000,
  });
  const chatDisabled = settings != null && settings.aiProvider === "none";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pb-1 pt-3">
        <Link
          href="/"
          className="-mx-1 flex items-center gap-2.5 rounded-lg px-1 py-1 transition-colors duration-200 hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        >
          <img src="/logo_lightmode.svg" alt="Spent" className="h-7 w-auto shrink-0 dark:hidden" />
          <img
            src="/logo_darkmode.svg"
            alt="Spent"
            className="hidden h-7 w-auto shrink-0 dark:block"
          />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="font-serif text-[17px] font-semibold leading-tight tracking-tight">
              Spent
            </div>
            <div className="mt-px text-[10px] font-semibold leading-tight tracking-[0.08em] text-muted-foreground">
              {t("brandTagline")}
            </div>
          </div>
        </Link>
        <WorkspaceSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const label = t(item.labelKey);
                const disabled = item.href === "/chat" && chatDisabled;
                const tooltip = disabled ? t("chatDisabledHint") : label;
                if (disabled) {
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        disabled
                        aria-disabled
                        tooltip={tooltip}
                        className="cursor-not-allowed opacity-50"
                      >
                        <item.Icon />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }
                const active = item.match(pathname);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={
                        <Link href={item.href} aria-current={active ? "page" : undefined}>
                          <item.Icon />
                          <span>{label}</span>
                        </Link>
                      }
                      isActive={active}
                      tooltip={tooltip}
                    />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {FOOTER_NAV.map((item) => {
                const label = t(item.labelKey);
                const active = item.match(pathname);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={
                        <Link href={item.href} aria-current={active ? "page" : undefined}>
                          <item.Icon />
                          <span>{label}</span>
                        </Link>
                      }
                      isActive={active}
                      tooltip={label}
                    />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                  <Star />
                  <span>{t("starOnGitHub")}</span>
                </a>
              }
              tooltip={t("starOnGitHub")}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
