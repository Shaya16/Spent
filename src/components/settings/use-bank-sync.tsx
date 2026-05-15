"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { startSync, type SyncProgressEvent } from "@/lib/api";

export interface SyncState {
  syncing: boolean;
  stage: string;
}

export function useBankSync() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<Record<string, SyncState>>({});

  const start = useCallback(
    (provider: string) => {
      setState((prev) => ({
        ...prev,
        [provider]: { syncing: true, stage: "Connecting…" },
      }));
      startSync(provider, (event: SyncProgressEvent) => {
        if (event.type === "provider-start") {
          setState((prev) => ({
            ...prev,
            [provider]: { syncing: true, stage: "Pulling transactions…" },
          }));
        } else if (event.type === "stage") {
          const s = event.data.stage as string;
          setState((prev) => ({
            ...prev,
            [provider]: {
              syncing: true,
              stage: s === "categorizing" ? "Categorizing…" : "Working…",
            },
          }));
        } else if (event.type === "complete") {
          setState((prev) => ({
            ...prev,
            [provider]: { syncing: false, stage: "" },
          }));
          const data = event.data as {
            added: number;
            updated: number;
            categorized: number;
          };
          toast.success(
            `Sync complete: ${data.added} new, ${data.updated} updated, ${data.categorized} categorized`
          );
          queryClient.invalidateQueries({ queryKey: ["integrations"] });
          queryClient.invalidateQueries({ queryKey: ["summary"] });
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        } else if (event.type === "error") {
          setState((prev) => ({
            ...prev,
            [provider]: { syncing: false, stage: "" },
          }));
          toast.error((event.data.message as string) ?? "Sync failed", {
            duration: Infinity,
            closeButton: true,
          });
        }
      });
    },
    [queryClient]
  );

  const stateFor = (provider: string): SyncState =>
    state[provider] ?? { syncing: false, stage: "" };

  const anySyncing = Object.values(state).some((s) => s.syncing);

  return { start, stateFor, anySyncing };
}
