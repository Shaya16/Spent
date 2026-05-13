"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Wallet,
  ArrowLeftRight,
  Settings as SettingsIcon,
  Star,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Budgets", Icon: Wallet, match: (p: string) => p === "/" },
  {
    href: "/transactions",
    label: "Transactions",
    Icon: ArrowLeftRight,
    match: (p: string) => p.startsWith("/transactions"),
  },
];

const BOTTOM_NAV = [
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
    <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col border-r border-border/40 bg-sidebar px-4 py-6 md:flex">
      <Link
        href="/"
        className="mb-7 flex items-center gap-2.5 px-2 transition-opacity hover:opacity-80"
      >
        <svg width="34" height="34" viewBox="0 0 34 34">
          <circle cx="17" cy="22" r="10.5" fill="var(--primary)" />
          <circle cx="17" cy="11" r="5" fill="var(--status-heads-up)" />
          <circle cx="25" cy="16" r="3.6" fill="var(--status-plenty-left)" />
        </svg>
        <div>
          <div className="text-lg font-bold leading-none tracking-tight">
            Spent
          </div>
          <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">
            YOUR MONEY · OPEN SOURCE
          </div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            Icon={item.Icon}
            active={item.match(pathname)}
          />
        ))}

        <div className="my-4 h-px bg-border/40" />

        {BOTTOM_NAV.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            Icon={item.Icon}
            active={item.match(pathname)}
          />
        ))}

        <div className="mt-auto pt-4">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-card"
          >
            <Star className="h-4 w-4" />
            <span>Star on GitHub</span>
          </a>
        </div>
      </nav>
    </aside>
  );
}

function NavItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
        active
          ? "bg-card font-semibold text-foreground"
          : "font-medium text-muted-foreground hover:bg-card/60 hover:text-foreground"
      }`}
    >
      {active && (
        <motion.div
          layoutId="nav-active"
          className="absolute inset-0 rounded-xl bg-card"
          transition={{ type: "spring", damping: 22, stiffness: 200 }}
        />
      )}
      <Icon className="relative h-4 w-4 shrink-0" />
      <span className="relative">{label}</span>
    </Link>
  );
}
