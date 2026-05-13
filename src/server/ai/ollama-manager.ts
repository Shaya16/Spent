import "server-only";

import { spawn, type ChildProcess } from "child_process";

declare global {
  var _ollamaProcess: ChildProcess | undefined;
  var _ollamaExitHandlerRegistered: boolean | undefined;
}

async function isReachable(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForReachable(
  url: string,
  maxWaitMs: number
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await isReachable(url)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

export interface OllamaCheckResult {
  ok: boolean;
  error?: string;
  spawned?: boolean;
}

export async function ensureOllamaRunning(
  url: string
): Promise<OllamaCheckResult> {
  if (await isReachable(url)) {
    return { ok: true };
  }

  if (globalThis._ollamaProcess && !globalThis._ollamaProcess.killed) {
    if (await waitForReachable(url, 5000)) {
      return { ok: true, spawned: true };
    }
  }

  console.log("[ollama] not reachable, attempting to spawn 'ollama serve'");

  try {
    const proc = spawn("ollama", ["serve"], {
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (data: Buffer) => {
      console.log(`[ollama serve] ${data.toString().trim()}`);
    });
    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) console.log(`[ollama serve] ${text}`);
    });
    proc.on("error", (err) => {
      console.error("[ollama serve] process error:", err);
    });

    globalThis._ollamaProcess = proc;

    const errorOnSpawn = await new Promise<NodeJS.ErrnoException | null>(
      (resolve) => {
        const timer = setTimeout(() => resolve(null), 200);
        proc.once("error", (err) => {
          clearTimeout(timer);
          resolve(err as NodeJS.ErrnoException);
        });
      }
    );

    if (errorOnSpawn) {
      if (errorOnSpawn.code === "ENOENT") {
        return {
          ok: false,
          error:
            "Ollama is not installed. Install it from https://ollama.com, then try again.",
        };
      }
      return {
        ok: false,
        error: `Failed to start Ollama: ${errorOnSpawn.message}`,
      };
    }

    if (await waitForReachable(url, 10000)) {
      console.log("[ollama] up and running");
      return { ok: true, spawned: true };
    }

    return {
      ok: false,
      error:
        "Ollama was started but didn't respond within 10 seconds. Check if another process is using port 11434.",
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to start Ollama: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

if (!globalThis._ollamaExitHandlerRegistered) {
  globalThis._ollamaExitHandlerRegistered = true;
  const killChild = () => {
    if (globalThis._ollamaProcess && !globalThis._ollamaProcess.killed) {
      globalThis._ollamaProcess.kill();
    }
  };
  process.on("exit", killChild);
  process.on("SIGINT", () => {
    killChild();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    killChild();
    process.exit(0);
  });
}
