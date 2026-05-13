"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startSync } from "@/lib/api";
import { toast } from "sonner";

interface SyncButtonProps {
  onComplete: () => void;
}

export function SyncButton({ onComplete }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [stage, setStage] = useState("");

  const handleSync = () => {
    setSyncing(true);
    setStage("Connecting...");

    const { cancel } = startSync("isracard", (event) => {
      if (event.type === "progress") {
        const message = event.data.message as string;
        setStage(message);
      } else if (event.type === "complete") {
        const { added, updated, categorized } = event.data as {
          added: number;
          updated: number;
          categorized: number;
        };
        setSyncing(false);
        setStage("");
        toast.success(
          `Sync complete: ${added} new, ${updated} updated, ${categorized} categorized`
        );
        onComplete();
      } else if (event.type === "error") {
        setSyncing(false);
        setStage("");
        toast.error(event.data.message as string);
      }
    });

    return () => cancel();
  };

  return (
    <div className="flex items-center gap-2">
      {syncing && (
        <span className="text-xs text-muted-foreground animate-pulse">
          {stage}
        </span>
      )}
      <Button
        size="sm"
        onClick={handleSync}
        disabled={syncing}
        className="gap-1.5"
      >
        {syncing ? (
          <svg
            className="h-3.5 w-3.5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        )}
        {syncing ? "Syncing" : "Sync Now"}
      </Button>
    </div>
  );
}
