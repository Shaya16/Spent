"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { type SyncProgressEvent, startSync } from "@/lib/api";

export interface SyncState {
  syncing: boolean;
  stage: string;
}

export function useBankSync() {
  const queryClient = useQueryClient();
  const t = useTranslations("settings.bank");
  const [state, setState] = useState<Record<number, SyncState>>({});

  const start = useCallback(
    (credentialId: number) => {
      setState((prev) => ({
        ...prev,
        [credentialId]: { syncing: true, stage: t("stageConnecting") },
      }));
      const { cancel } = startSync(credentialId, (event: SyncProgressEvent) => {
        if (event.type === "provider-start") {
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: true, stage: t("stagePulling") },
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
            t("twoFaFallbackBank");
          toast.warning(t("twoFaNeededTitle", { bank: label }), {
            description: t("twoFaNeededDescription"),
            duration: 12000,
            closeButton: true,
          });
        } else if (event.type === "provider-2fa-manual") {
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: true, stage: t("stageSolve2fa") },
          }));
        } else if (event.type === "stage") {
          const s = event.data.stage as string;
          setState((prev) => ({
            ...prev,
            [credentialId]: {
              syncing: true,
              stage: s === "categorizing" ? t("stageCategorizing") : t("stageWorking"),
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
            t("syncDone", {
              added: data.added,
              updated: data.updated,
              categorized: data.categorized,
            }),
          );
          queryClient.invalidateQueries({ queryKey: ["integrations"] });
          queryClient.invalidateQueries({ queryKey: ["summary"] });
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        } else if (event.type === "error") {
          setState((prev) => ({
            ...prev,
            [credentialId]: { syncing: false, stage: "" },
          }));
          toast.error((event.data.message as string) ?? t("syncFailed"), {
            duration: Infinity,
            closeButton: true,
          });
        }
      });
    },
    [queryClient, t],
  );

  const stateFor = (credentialId: number): SyncState =>
    state[credentialId] ?? { syncing: false, stage: "" };

  const anySyncing = Object.values(state).some((s) => s.syncing);

  return { start, stateFor, anySyncing };
}
