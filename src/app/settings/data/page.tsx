"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Trash2, AlertTriangle } from "lucide-react";
import {
  deleteAllTransactions,
  getSettings,
  updateSettings,
} from "@/lib/api";
import { toast } from "sonner";
import { SectionShell, SettingCard } from "@/components/settings/section-shell";
import { WorkspaceDangerCard } from "@/components/settings/workspace-controls";

export default function DataSettingsPage() {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  return (
    <SectionShell
      title="Data & privacy"
      description="Spent runs locally. Your credentials are encrypted at rest and never leave your machine."
    >
      {settings ? (
        <ShowBrowserCard initial={settings.showBrowser} />
      ) : (
        <SettingCard>
          <div className="text-sm text-muted-foreground">Loading…</div>
        </SettingCard>
      )}
      <SettingCard
        title="How your data is stored"
        description="Bank credentials and your Claude API key are encrypted with AES-256-GCM. The encryption key lives at data/.encryption-key on your machine (gitignored) and is auto-generated on first run. All transaction data lives in data/spent.db. To reset everything, stop the dev server and delete the data/ directory."
      >
        <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <code>data/spent.db</code> · <code>data/.encryption-key</code>
        </div>
      </SettingCard>
      <DangerZone />
      <WorkspaceDangerCard />
    </SectionShell>
  );
}

function DangerZone() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: deleteAllTransactions,
    onSuccess: (data) => {
      toast.success(
        `Deleted ${data.deleted.txCount} transactions, ${data.deleted.memoryCount} memory entries`
      );
      queryClient.invalidateQueries();
      setConfirmOpen(false);
      setConfirmText("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    },
  });

  const canConfirm = confirmText.trim().toLowerCase() === "delete";

  return (
    <>
      <div className="rounded-2xl border border-[color-mix(in_oklch,var(--status-over)_30%,transparent)] bg-[color-mix(in_oklch,var(--status-over)_6%,var(--card))] p-6">
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background:
                "color-mix(in oklch, var(--status-over) 14%, transparent)",
            }}
          >
            <AlertTriangle
              className="h-4 w-4"
              style={{ color: "var(--status-over)" }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium">Delete all transaction data</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Wipes every synced transaction, sync run, and merchant-memory
              entry. Your bank credentials, AI settings, budgets, and categories
              stay put. Use this to start over from a clean slate. Cannot be
              undone.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            style={{
              borderColor:
                "color-mix(in oklch, var(--status-over) 40%, transparent)",
              color: "var(--status-over)",
            }}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete data
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!mutation.isPending) {
            setConfirmOpen(o);
            if (!o) setConfirmText("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                background:
                  "color-mix(in oklch, var(--status-over) 14%, transparent)",
              }}
            >
              <AlertTriangle
                className="h-5 w-5"
                style={{ color: "var(--status-over)" }}
              />
            </div>
            <div>
              <DialogTitle className="font-serif text-xl font-normal">
                Delete all transaction data?
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                This cannot be undone.
              </DialogDescription>
            </div>
          </div>

          <div className="space-y-3 pt-2 text-sm">
            <p className="text-muted-foreground">This will permanently remove:</p>
            <ul className="space-y-1 pl-5 text-xs text-muted-foreground">
              <li className="list-disc">All transactions</li>
              <li className="list-disc">All sync run history</li>
              <li className="list-disc">All merchant-memory entries</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Kept: bank credentials, AI configuration, budgets, categories.
            </p>

            <div className="pt-2">
              <Label
                htmlFor="confirm-input"
                className="text-xs text-muted-foreground"
              >
                Type <code className="font-mono">delete</code> to confirm
              </Label>
              <Input
                id="confirm-input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="delete"
                className="mt-1.5 h-9"
                autoFocus
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!canConfirm || mutation.isPending}
              onClick={() => mutation.mutate()}
              style={
                canConfirm
                  ? {
                      background: "var(--status-over)",
                      color: "var(--background)",
                    }
                  : undefined
              }
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {mutation.isPending ? "Deleting..." : "Delete everything"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ShowBrowserCard({ initial }: { initial: boolean }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initial);
  const mutation = useMutation({
    mutationFn: (value: boolean) => updateSettings({ showBrowser: value }),
    onSuccess: (_, value) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(
        value
          ? "Browser will be visible on next sync"
          : "Browser will stay hidden"
      );
    },
  });

  const handleToggle = (value: boolean) => {
    setEnabled(value);
    mutation.mutate(value);
  };

  return (
    <SettingCard>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="show-browser-toggle">Show browser during sync</Label>
          <p className="text-xs text-muted-foreground">
            Opens a visible Chromium window so you can watch the scrape happen
            (useful for debugging or solving 2FA / captcha challenges). Also
            enables verbose scraper logs in your dev terminal.
          </p>
        </div>
        <Switch
          id="show-browser-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
        />
      </div>
    </SettingCard>
  );
}
