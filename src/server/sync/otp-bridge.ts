import "server-only";

/**
 * In-memory bridge for shuttling OTP codes from the browser back to the
 * scraper. The SSE stream is server->client; this fills in the missing
 * client->server channel by parking a promise on the server keyed by syncRunId
 * and resolving it when the user POSTs the code to /api/sync/otp.
 *
 * Safe for a single-process Next.js server (which Spent is by design - it's a
 * local-only app). Don't lift this to a cluster without an external store.
 */

const OTP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface PendingOtp {
  resolve: (code: string) => void;
  reject: (reason: Error) => void;
  timeoutHandle: NodeJS.Timeout;
  workspaceId: number;
  provider: string;
}

const pending = new Map<number, PendingOtp>();

export interface OtpRequest {
  /** Awaits the user-supplied code. Rejects on cancel or timeout. */
  wait: () => Promise<string>;
}

export function registerOtpRequest(
  syncRunId: number,
  workspaceId: number,
  provider: string
): OtpRequest {
  // If there was a stale entry for this id, blow it away.
  const stale = pending.get(syncRunId);
  if (stale) {
    clearTimeout(stale.timeoutHandle);
    stale.reject(new Error("OTP request superseded"));
    pending.delete(syncRunId);
  }

  let waitPromise: Promise<string> | null = null;

  return {
    wait: () => {
      if (waitPromise) return waitPromise;
      waitPromise = new Promise<string>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          if (pending.get(syncRunId)) {
            pending.delete(syncRunId);
            reject(
              new Error(
                "Timed out waiting for the one-time code. Try syncing again."
              )
            );
          }
        }, OTP_TIMEOUT_MS);

        pending.set(syncRunId, {
          resolve,
          reject,
          timeoutHandle,
          workspaceId,
          provider,
        });
      });
      return waitPromise;
    },
  };
}

interface DeliverResult {
  ok: boolean;
  reason?: string;
}

export function deliverOtp(
  syncRunId: number,
  workspaceId: number,
  code: string
): DeliverResult {
  const entry = pending.get(syncRunId);
  if (!entry) return { ok: false, reason: "No pending OTP request." };
  if (entry.workspaceId !== workspaceId) {
    return { ok: false, reason: "Workspace mismatch." };
  }
  clearTimeout(entry.timeoutHandle);
  pending.delete(syncRunId);
  entry.resolve(code);
  return { ok: true };
}

export function cancelOtpRequest(syncRunId: number, reason?: string): void {
  const entry = pending.get(syncRunId);
  if (!entry) return;
  clearTimeout(entry.timeoutHandle);
  pending.delete(syncRunId);
  entry.reject(new Error(reason ?? "OTP request cancelled."));
}

export function hasPendingOtp(syncRunId: number): boolean {
  return pending.has(syncRunId);
}
