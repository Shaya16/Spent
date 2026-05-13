"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Returns true after the component has hydrated on the client.
 * Returns false during SSR and the initial client render that matches SSR.
 *
 * Use this to safely render client-only UI without triggering hydration
 * mismatches - e.g. theme-aware controls (next-themes), localStorage-backed
 * state, or anything that depends on `window` / `document`.
 *
 * `useSyncExternalStore` is the React 18+ way to do this cleanly. The
 * `getServerSnapshot` returns false (matching the SSR render), and the
 * `getSnapshot` returns true on the client, which triggers a one-time
 * re-render after hydration completes.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
