"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
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
import { WorkspaceSwitcher } from "./workspace-switcher";

const NAV = [
  {
    href: "/",
    label: "Home",
    Icon: LayoutDashboard,
    match: (p: string) => p === "/",
  },
  {
    href: "/budget",
    label: "Budget",
    Icon: Wallet,
    match: (p: string) => p.startsWith("/budget"),
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
          className="-mx-1 flex items-center gap-2.5 rounded-lg px-1 py-1 transition-colors duration-200 hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        >
          <img
            src="/logo_lightmode.svg"
            alt="Spent"
            className="h-7 w-auto shrink-0 dark:hidden"
          />
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
              YOUR MONEY · OPEN SOURCE
            </div>
          </div>
        </Link>
        <WorkspaceSwitcher />
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
                  href="https://github.com/Shaya16/Spent"
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
