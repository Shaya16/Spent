"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingCard } from "./section-shell";
import {
  deleteWorkspace,
  listWorkspaces,
  renameWorkspace,
} from "@/lib/api";
import {
  setActiveWorkspaceId,
  useActiveWorkspaceId,
} from "@/lib/workspace-store";
import type { Workspace } from "@/lib/types";

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
  const { active } = useActiveWorkspace();
  if (!active) {
    return (
      <SettingCard title="Workspace name">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </SettingCard>
    );
  }
  return <WorkspaceNameCardInner workspace={active} />;
}

function WorkspaceNameCardInner({ workspace }: { workspace: Workspace }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(workspace.name);

  const rename = useMutation({
    mutationFn: (n: string) => renameWorkspace(workspace.id, n),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success("Workspace renamed");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    },
  });

  const dirty = name.trim() !== workspace.name && name.trim().length > 0;

  return (
    <SettingCard
      title="Workspace name"
      description="Shown in the sidebar switcher. Visible only to you."
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px] space-y-1.5">
          <Label htmlFor="workspace-rename">Name</Label>
          <Input
            id="workspace-rename"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          <p className="text-[11px] text-muted-foreground">
            Slug: <code className="rounded bg-muted px-1">{workspace.slug}</code>
          </p>
        </div>
        <Button
          onClick={() => rename.mutate(name.trim())}
          disabled={!dirty || rename.isPending}
        >
          {rename.isPending ? "Saving…" : "Save"}
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
      toast.success(`"${workspace.name}" deleted`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    },
  });

  return (
    <>
      <SettingCard
        title="Delete this workspace"
        description="Permanently removes this workspace and every bank connection, transaction, category, and budget inside it. The other workspaces are untouched."
      >
        <Button
          variant="destructive"
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          <Trash2 className="mr-2 size-4" />
          Delete workspace
        </Button>
        {disabled ? (
          <p className="mt-2 text-xs text-muted-foreground">
            You can&apos;t delete your only workspace. Create another one first.
          </p>
        ) : null}
      </SettingCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{workspace.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              Every transaction, category, budget, and saved bank credential in
              this workspace will be permanently removed. This can&apos;t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => del.mutate()}
              disabled={del.isPending}
            >
              {del.isPending ? "Deleting…" : "Delete workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
