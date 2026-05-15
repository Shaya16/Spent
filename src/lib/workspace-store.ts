"use client";

import { useSyncExternalStore } from "react";

// Tiny custom store. Persists the active workspace id to localStorage and
// exposes a non-React getter so non-component code (e.g. fetchJSON) can
// inject the X-Workspace-ID header.

const STORAGE_KEY = "spent.activeWorkspaceId";

let memValue: number | null = readFromStorage();
const listeners = new Set<() => void>();

function readFromStorage(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeToStorage(value: number | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value == null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Storage may be unavailable (private mode, quota). Memory still works.
  }
}

export function getActiveWorkspaceIdSync(): number | null {
  return memValue;
}

export function setActiveWorkspaceId(value: number | null): void {
  if (memValue === value) return;
  memValue = value;
  writeToStorage(value);
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useActiveWorkspaceId(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => memValue,
    () => null
  );
}
