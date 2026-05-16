import "server-only";

import { runAllWorkspaces } from "@/server/sync/orchestrator";
import { getGlobalSetting } from "@/server/db/queries/settings";

interface SchedulerState {
  timeoutId: ReturnType<typeof setTimeout> | null;
  nextRunAt: number | null;
  running: boolean;
  initialized: boolean;
  exitHandlerRegistered: boolean;
}

declare global {
  var __spentScheduler: SchedulerState | undefined;
}

function getState(): SchedulerState {
  if (!globalThis.__spentScheduler) {
    globalThis.__spentScheduler = {
      timeoutId: null,
      nextRunAt: null,
      running: false,
      initialized: false,
      exitHandlerRegistered: false,
    };
  }
  return globalThis.__spentScheduler;
}

const TZ = "Asia/Jerusalem";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function intlParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Some Intl impls report hour 24 at midnight; normalise.
    hour: Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function computeNextDelay(targetHHMM: string): number {
  const [tHour, tMin] = targetHHMM.split(":").map(Number);
  const now = new Date();
  const jlm = intlParts(now);

  let candidateMs = Date.UTC(jlm.year, jlm.month - 1, jlm.day, tHour, tMin, 0);
  const nowMs = Date.UTC(
    jlm.year,
    jlm.month - 1,
    jlm.day,
    jlm.hour,
    jlm.minute,
    jlm.second
  );

  if (candidateMs <= nowMs) {
    candidateMs += 24 * 3600 * 1000;
  }

  return candidateMs - nowMs;
}

function readSettings(): { enabled: boolean; time: string } {
  const enabled = getGlobalSetting("auto_sync_enabled") === "true";
  const time = getGlobalSetting("auto_sync_time");
  const safeTime = time && TIME_RE.test(time) ? time : "06:00";
  return { enabled, time: safeTime };
}

function cancel(): void {
  const state = getState();
  if (state.timeoutId) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
    state.nextRunAt = null;
    console.log("[scheduler] cancelled");
  }
}

function armNext(): void {
  const state = getState();
  const { enabled, time } = readSettings();
  if (!enabled) {
    state.nextRunAt = null;
    return;
  }

  const delayMs = computeNextDelay(time);
  state.timeoutId = setTimeout(fire, delayMs);
  state.nextRunAt = Date.now() + delayMs;
  console.log(
    `[scheduler] armed for ${new Date(state.nextRunAt).toISOString()} (in ${Math.round(
      delayMs / 1000
    )}s)`
  );
}

async function fire(): Promise<void> {
  const state = getState();
  state.timeoutId = null;

  if (state.running) {
    console.warn("[scheduler] skip fire — previous run still in progress");
    armNext();
    return;
  }

  state.running = true;
  console.log("[scheduler] running");
  try {
    await runAllWorkspaces();
    console.log("[scheduler] done");
  } catch (err) {
    console.error("[scheduler] run failed:", err);
  } finally {
    state.running = false;
    armNext();
  }
}

export function reschedule(): void {
  cancel();
  armNext();
}

export function initScheduler(): void {
  const state = getState();
  if (state.initialized) {
    cancel();
    armNext();
    return;
  }
  state.initialized = true;
  armNext();
  registerExitHandlers();
}

export function getNextRunAt(): string | null {
  const state = getState();
  if (state.nextRunAt == null) return null;
  return new Date(state.nextRunAt).toISOString();
}

function registerExitHandlers(): void {
  const state = getState();
  if (state.exitHandlerRegistered) return;
  state.exitHandlerRegistered = true;
  const stop = () => cancel();
  process.on("exit", stop);
  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(0);
  });
}
