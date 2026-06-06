"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteWorkspace, listWorkspaces, renameWorkspace } from "@/lib/api";
import type { Workspace } from "@/lib/types";
import { setActiveWorkspaceId, useActiveWorkspaceId } from "@/lib/workspace-store";
import { SettingCard } from "./section-shell";

function useActiveWorkspace() {
  const activeId = useActiveWorkspaceId();
  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];
  return { workspaces, active };
}

export function WorkspaceNameCard() {
  const t = useTranslations("settings.workspace");
  const tCommon = useTranslations("common");
  const { active } = useActiveWorkspace();
  if (!active) {
    return (
      <SettingCard title={t("nameTitle")}>
        <div className="text-sm text-muted-foreground">{tCommon("loading")}</div>
      </SettingCard>
    );
  }
  return <WorkspaceNameCardInner workspace={active} />;
}

function WorkspaceNameCardInner({ workspace }: { workspace: Workspace }) {
  const t = useTranslations("settings.workspace");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [name, setName] = useState(workspace.name);

  const rename = useMutation({
    mutationFn: (n: string) => renameWorkspace(workspace.id, n),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success(t("renamed"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("renameFailed"));
    },
  });

  const dirty = name.trim() !== workspace.name && name.trim().length > 0;

  return (
    <SettingCard title={t("nameTitle")} description={t("nameDescription")}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px] space-y-1.5">
          <Label htmlFor="workspace-rename">{t("nameLabel")}</Label>
          <Input
            id="workspace-rename"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          <p className="text-[11px] text-muted-foreground">
            {t("slugLabel")} <code className="rounded bg-muted px-1">{workspace.slug}</code>
          </p>
        </div>
        <Button onClick={() => rename.mutate(name.trim())} disabled={!dirty || rename.isPending}>
          {rename.isPending ? tCommon("saving") : tCommon("save")}
        </Button>
      </div>
    </SettingCard>
  );
}

export function WorkspaceDangerCard() {
  const queryClient = useQueryClient();
  const { workspaces, active } = useActiveWorkspace();
  if (!active) return null;
  const onlyOne = workspaces.length <= 1;
  return (
    <DangerCard
      workspace={active}
      disabled={onlyOne}
      onDeleted={(remainingId) => {
        setActiveWorkspaceId(remainingId);
        queryClient.invalidateQueries();
      }}
    />
  );
}

function DangerCard({
  workspace,
  disabled,
  onDeleted,
}: {
  workspace: Workspace;
  disabled: boolean;
  onDeleted: (remainingId: number) => void;
}) {
  const t = useTranslations("settings.workspace");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const del = useMutation({
    mutationFn: () => deleteWorkspace(workspace.id),
    onSuccess: async () => {
      const list = await queryClient.fetchQuery<Workspace[]>({
        queryKey: ["workspaces"],
        queryFn: listWorkspaces,
      });
      const next = list.find((w) => w.id !== workspace.id);
      if (next) onDeleted(next.id);
      setOpen(false);
      toast.success(t("deletedToast", { name: workspace.name }));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("deleteFailed"));
    },
  });

  return (
    <>
      <SettingCard title={t("dangerTitle")} description={t("dangerDescription")}>
        <Button variant="destructive" onClick={() => setOpen(true)} disabled={disabled}>
          <Trash2 className="me-2 size-4" />
          {t("deleteButton")}
        </Button>
        {disabled ? <p className="mt-2 text-xs text-muted-foreground">{t("lastOneHint")}</p> : null}
      </SettingCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle", { name: workspace.name })}</DialogTitle>
            <DialogDescription>{t("confirmDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>
              {del.isPending ? tCommon("deleting") : t("deleteButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
