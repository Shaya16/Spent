"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { startSync, submitSyncOtp } from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import {
  SyncProgressDialog,
  type ProviderRow,
} from "./sync-progress-dialog";

interface SyncButtonProps {
  onComplete: () => void;
}

export function SyncButton({ onComplete }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [stage, setStage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState<{
    added: number;
    updated: number;
    categorized: number;
  } | null>(null);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const cancelRef = useRef<() => void>(() => {});
  const awaitingOtpRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!done || !dialogOpen) return;
    if (aiWarning) return;
    const t = setTimeout(() => setDialogOpen(false), 3500);
    return () => clearTimeout(t);
  }, [done, dialogOpen, aiWarning]);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleSubmitOtp = useCallback(
    async (syncRunId: number, code: string) => {
      await submitSyncOtp(syncRunId, code);
    },
    []
  );

  const handleSync = () => {
    setSyncing(true);
    setProviders([]);
    setRows([]);
    setStage(null);
    setDone(false);
    setSummary(null);
    setAiWarning(null);
    setDialogOpen(true);
    awaitingOtpRef.current = new Set();

    const { cancel } = startSync(undefined, (event) => {
      if (event.type === "plan") {
        const list = (event.data.providers as string[]) ?? [];
        setProviders(list);
        setRows(
          list.map((p) => ({ provider: p, status: "idle", added: 0, updated: 0 }))
        );
      } else if (event.type === "provider-start") {
        const provider = event.data.provider as string;
        setRows((prev) =>
          prev.map((r) =>
            r.provider === provider ? { ...r, status: "running" } : r
          )
        );
      } else if (event.type === "provider-2fa-needed") {
        const provider = event.data.provider as string;
        const syncRunId = event.data.syncRunId as number;
        awaitingOtpRef.current.add(provider);
        setRows((prev) =>
          prev.map((r) =>
            r.provider === provider
              ? { ...r, status: "awaiting-otp", syncRunId }
              : r
          )
        );
      } else if (event.type === "provider-2fa-submitted") {
        const provider = event.data.provider as string;
        awaitingOtpRef.current.delete(provider);
        setRows((prev) =>
          prev.map((r) =>
            r.provider === provider ? { ...r, status: "running" } : r
          )
        );
      } else if (event.type === "provider-2fa-manual") {
        const provider = event.data.provider as string;
        setRows((prev) =>
          prev.map((r) =>
            r.provider === provider ? { ...r, status: "manual-2fa" } : r
          )
        );
      } else if (event.type === "provider-done") {
        const provider = event.data.provider as string;
        const ok = event.data.ok as boolean;
        const added = (event.data.added as number) ?? 0;
        const updated = (event.data.updated as number) ?? 0;
        const errorMessage = event.data.errorMessage as string | undefined;
        awaitingOtpRef.current.delete(provider);
        setRows((prev) =>
          prev.map((r) =>
            r.provider === provider
              ? {
                  ...r,
                  status: ok ? "done" : "error",
                  added,
                  updated,
                  errorMessage,
                }
              : r
          )
        );
        if (!ok && errorMessage) {
          toast.error(`${provider}: ${errorMessage}`, {
            duration: 8000,
            closeButton: true,
          });
        }
      } else if (event.type === "stage") {
        setStage((event.data.stage as string) ?? null);
      } else if (event.type === "complete") {
        const added = (event.data.added as number) ?? 0;
        const updated = (event.data.updated as number) ?? 0;
        const categorized = (event.data.categorized as number) ?? 0;
        const warning = event.data.aiWarning as string | null;
        setSummary({ added, updated, categorized });
        setStage(null);
        setDone(true);
        setSyncing(false);
        setAiWarning(warning ?? null);
        if (warning) {
          toast.warning("AI categorization issue", {
            description: warning,
            duration: 6000,
            closeButton: true,
          });
        }
        onComplete();
      } else if (event.type === "error") {
        const message = event.data.message as string;
        setSyncing(false);
        setDialogOpen(false);
        toast.error(message, {
          duration: Infinity,
          closeButton: true,
          description: "Check the dev server terminal for full details.",
        });
      }
    });

    cancelRef.current = cancel;
  };

  return (
    <>
      <Button
        size="sm"
        onClick={handleSync}
        disabled={syncing}
        className="gap-1.5"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Syncing…" : "Sync & Categorize"}
      </Button>

      <SyncProgressDialog
        open={dialogOpen}
        providers={providers}
        rows={rows}
        stage={stage}
        done={done}
        summary={summary}
        aiWarning={aiWarning}
        onClose={closeDialog}
        onSubmitOtp={handleSubmitOtp}
      />
    </>
  );
}
