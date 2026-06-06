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
          {/* Local static SVG logos; next/image adds no value here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_lightmode.svg" alt="Spent" className="h-7 w-auto shrink-0 dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
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

      <SidebarFooter className="p-2">
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3.5 transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
        >
          <div className="flex items-center gap-2">
            <GithubMark className="h-4 w-4" />
            <span className="text-sm font-semibold tracking-tight">{t("githubBannerTitle")}</span>
          </div>
          <p className="text-xs leading-snug text-muted-foreground">{t("githubBannerSubtitle")}</p>
          <span className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground">
            <Star className="h-3.5 w-3.5" />
            {t("starOnGitHub")}
          </span>
        </a>
        <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
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

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.438 9.63 8.205 11.188.6.111.82-.254.82-.567 0-.28-.01-1.022-.015-2.005-3.338.711-4.042-1.582-4.042-1.582-.546-1.361-1.335-1.725-1.335-1.725-1.087-.731.084-.716.084-.716 1.205.082 1.838 1.215 1.838 1.215 1.07 1.803 2.809 1.282 3.495.981.108-.763.418-1.282.762-1.577-2.665-.295-5.466-1.309-5.466-5.827 0-1.287.465-2.339 1.235-3.164-.135-.298-.54-1.497.105-3.121 0 0 1.005-.316 3.3 1.209a11.5 11.5 0 0 1 3-.398c1.02.006 2.04.136 3 .398 2.28-1.525 3.285-1.209 3.285-1.209.645 1.624.24 2.823.12 3.121.765.825 1.23 1.877 1.23 3.164 0 4.53-2.805 5.527-5.475 5.817.42.354.81 1.077.81 2.171 0 1.567-.015 2.83-.015 3.213 0 .315.21.683.825.567C20.565 21.917 24 17.5 24 12.292 24 5.78 18.627.5 12 .5z" />
    </svg>
  );
}
