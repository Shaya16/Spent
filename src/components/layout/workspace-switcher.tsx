"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, FolderKanban, Plus, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useRouter } from "@/i18n/navigation";
import { listWorkspaces } from "@/lib/api";
import type { Workspace } from "@/lib/types";
import { setActiveWorkspaceId, useActiveWorkspaceId } from "@/lib/workspace-store";

export function useSwitchWorkspace() {
  const queryClient = useQueryClient();
  return (id: number) => {
    setActiveWorkspaceId(id);
    // Every cache key was scoped to the previous workspace, so wipe it all.
    // Each query refetches against the new X-Workspace-ID.
    queryClient.invalidateQueries();
  };
}

export function WorkspaceSwitcher() {
  const router = useRouter();
  const t = useTranslations("workspaceSwitcher");
  const switchWorkspace = useSwitchWorkspace();
  const activeId = useActiveWorkspaceId();

  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
    staleTime: 60_000,
  });

  // Bootstrap: if nothing is selected (first load, cleared storage), pick the
  // lowest-id workspace as soon as the list comes back. This avoids a window
  // where requests would fall back to the server-side default and ignore the
  // header entirely.
  useEffect(() => {
    if (activeId == null && workspaces.length > 0) {
      const fallback = workspaces[0];
      setActiveWorkspaceId(fallback.id);
    }
  }, [activeId, workspaces]);

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  const initial = (active?.name ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                tooltip={active?.name ?? t("heading")}
              />
            }
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 font-semibold text-primary">
              {initial}
            </div>
            <div className="flex min-w-0 flex-1 flex-col text-start group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium">
                {active?.name ?? t("fallbackName")}
              </span>
              <span className="truncate text-[11px] text-muted-foreground">{t("switchHint")}</span>
            </div>
            <ChevronsUpDown className="ms-auto size-4 shrink-0 opacity-60 group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" side="bottom" sideOffset={8} className="min-w-[14rem]">
            <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("heading")}
            </div>
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onClick={() => switchWorkspace(w.id)} className="gap-2">
                <FolderKanban className="size-4 opacity-70" />
                <span className="flex-1 truncate">{w.name}</span>
                {w.id === activeId ? <Check className="size-4 text-primary" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/setup?mode=new-workspace")}
              className="gap-2"
            >
              <Plus className="size-4" />
              {t("newWorkspace")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings/general")} className="gap-2">
              <Settings2 className="size-4" />
              {t("manage")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
