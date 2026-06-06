import "server-only";

import type { ActivitySnapshot, SyncKind } from "@/lib/types";
import { getNextRunAt } from "@/server/sync/scheduler";

interface ActivityState {
  syncStartedAt: number | null;
  syncKind: SyncKind | null;
  syncDepth: number;
  lastHeartbeatAt: number | null;
}

declare global {
  var __spentActivity: ActivityState | undefined;
}

const STALE_MS = 5 * 60 * 1000;

function getState(): ActivityState {
  if (!globalThis.__spentActivity) {
    globalThis.__spentActivity = {
      syncStartedAt: null,
      syncKind: null,
      syncDepth: 0,
      lastHeartbeatAt: null,
    };
  }
  return globalThis.__spentActivity;
}

export function markSyncStart(kind: SyncKind): void {
  const state = getState();
  state.syncDepth += 1;
  if (state.syncDepth === 1) {
    state.syncStartedAt = Date.now();
    state.syncKind = kind;
    state.lastHeartbeatAt = Date.now();
  }
}

export function markSyncEnd(): void {
  const state = getState();
  if (state.syncDepth > 0) state.syncDepth -= 1;
  if (state.syncDepth === 0) {
    state.syncStartedAt = null;
    state.syncKind = null;
    state.lastHeartbeatAt = null;
  }
}

export function markSyncHeartbeat(): void {
  const state = getState();
  if (state.syncDepth > 0) state.lastHeartbeatAt = Date.now();
}

export function getActivitySnapshot(): ActivitySnapshot {
  const state = getState();
  const active = state.syncDepth > 0;
  const stale =
    active && state.lastHeartbeatAt != null && Date.now() - state.lastHeartbeatAt > STALE_MS;

  const nextRunAt = getNextRunAt();

  const ollamaProc = globalThis._ollamaProcess;
  const ollamaSpawned = Boolean(ollamaProc && !ollamaProc.killed);

  return {
    sync: {
      active,
      since: state.syncStartedAt ? new Date(state.syncStartedAt).toISOString() : null,
      kind: state.syncKind,
      stale,
    },
    scheduler: {
      armed: nextRunAt != null,
      nextRunAt,
    },
    ollama: {
      running: ollamaSpawned,
      spawnedBySpent: ollamaSpawned,
    },
  };
}
