"use client";

import { useState } from "react";
import { FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WorkspaceNameStepProps {
  onComplete: (name: string) => void;
  submitting?: boolean;
}

export function WorkspaceNameStep({
  onComplete,
  submitting = false,
}: WorkspaceNameStepProps) {
  const [name, setName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onComplete(trimmed);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          New workspace
        </div>
        <h1 className="font-serif text-4xl leading-tight">
          Name your workspace
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Workspaces keep separate data sets isolated — different banks,
          different categories, different budgets. Common splits are Personal /
          Business / Partner.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="max-w-md space-y-5 rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <FolderKanban className="size-5" />
          </div>
          <div className="text-sm font-medium">Workspace details</div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="workspace-name">Workspace name</Label>
          <Input
            id="workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Business, Side hustle, Family"
            maxLength={60}
            autoFocus
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">
            You can rename this later from settings.
          </p>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={!name.trim() || submitting}
        >
          {submitting ? "Creating…" : "Create workspace and continue"}
        </Button>
      </form>
    </div>
  );
}
