"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { type SyncProgressEvent, startSync } from "@/lib/api";

export interface SyncState {
  syncing: boolean;
  stage: string;
}

export function useBankSync() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<Record<number, SyncState>>({});

  const start = useCallback(
    (credentialId: number) => {
      setState((prev) => ({
        ...prev,
        [credentialId]: { syncing: true, stage: "Connecting…" },
      }));
      const { cancel } = startSync(credentialId, (event: SyncProgressEvent) => {
        if (event.type === "provider-start") {
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: true, stage: "Pulling transactions…" },
          }));
        } else if (event.type === "provider-2fa-needed") {
          cancel();
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: false, stage: "" },
          }));
          const label =
            (event.data.label as string | undefined) ??
            (event.data.provider as string | undefined) ??
            "Bank";
          toast.warning(`${label} needs a 2FA code`, {
            description:
              "Use the global Sync button on the dashboard to enter the one-time code. Spent will remember the token for future syncs.",
            duration: 12000,
            closeButton: true,
          });
        } else if (event.type === "provider-2fa-manual") {
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: true, stage: "Solve 2FA in popup…" },
          }));
        } else if (event.type === "stage") {
          const s = event.data.stage as string;
          setState((prev) => ({
            ...prev,
            [credentialId]: {
              syncing: true,
              stage: s === "categorizing" ? "Categorizing…" : "Working…",
            },
          }));
        } else if (event.type === "complete") {
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: false, stage: "" },
          }));
          const data = event.data as {
            added: number;
            updated: number;
            categorized: number;
          };
          toast.success(
            `Sync complete: ${data.added} new, ${data.updated} updated, ${data.categorized} categorized`,
          );
          queryClient.invalidateQueries({ queryKey: ["integrations"] });
          queryClient.invalidateQueries({ queryKey: ["summary"] });
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        } else if (event.type === "error") {
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: false, stage: "" },
          }));
          toast.error((event.data.message as string) ?? "Sync failed", {
            duration: Infinity,
            closeButton: true,
          });
        }
      });
    },
    [queryClient],
  );

  const stateFor = (credentialId: number): SyncState =>
    state[credentialId] ?? { syncing: false, stage: "" };

  const anySyncing = Object.values(state).some((s) => s.syncing);

  return { start, stateFor, anySyncing };
}
