"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Wallet,
  ArrowLeftRight,
  Settings as SettingsIcon,
  Star,
} from "lucide-react";
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
  SidebarSeparator,
} from "@/components/ui/sidebar";

const NAV = [
  {
    href: "/",
    label: "Budgets",
    Icon: Wallet,
    match: (p: string) => p === "/",
  },
  {
    href: "/transactions",
    label: "Transactions",
    Icon: ArrowLeftRight,
    match: (p: string) => p.startsWith("/transactions"),
  },
];

const FOOTER_NAV = [
  {
    href: "/settings",
    label: "Settings",
    Icon: SettingsIcon,
    match: (p: string) => p.startsWith("/settings"),
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pb-1 pt-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 34 34"
            className="shrink-0"
          >
            <circle cx="17" cy="22" r="10.5" fill="var(--primary)" />
            <circle cx="17" cy="11" r="5" fill="var(--status-heads-up)" />
            <circle cx="25" cy="16" r="3.6" fill="var(--status-plenty-left)" />
          </svg>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-[15px] font-bold leading-tight tracking-tight">
              Spent
            </div>
            <div className="mt-px text-[10px] font-semibold leading-tight tracking-[0.08em] text-muted-foreground">
              YOUR MONEY · OPEN SOURCE
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={
                      <Link href={item.href}>
                        <item.Icon />
                        <span>{item.label}</span>
                      </Link>
                    }
                    isActive={item.match(pathname)}
                    tooltip={item.label}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {FOOTER_NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={
                      <Link href={item.href}>
                        <item.Icon />
                        <span>{item.label}</span>
                      </Link>
                    }
                    isActive={item.match(pathname)}
                    tooltip={item.label}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Star />
                  <span>Star on GitHub</span>
                </a>
              }
              tooltip="Star on GitHub"
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
