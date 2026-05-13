import {
  ensureOllamaRunning,
  pullOllamaModel,
} from "@/server/ai/ollama-manager";
import { getAppSettings } from "@/server/db/queries/settings";

function sseEvent(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    model?: string;
    url?: string;
  };
  if (!body.model) {
    return new Response("model is required", { status: 400 });
  }

  const url = body.url ?? getAppSettings().ollamaUrl;
  const model = body.model;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      try {
        const status = await ensureOllamaRunning(url);
        if (!status.ok) {
          send("error", { message: status.error ?? "Ollama unavailable" });
          controller.close();
          return;
        }

        const startTime = Date.now();
        let lastEmitAt = 0;

        for await (const progress of pullOllamaModel(url, model)) {
          if (progress.status === "success") {
            send("complete", {});
            break;
          }

          const elapsed = (Date.now() - startTime) / 1000;
          const completed = progress.completed ?? 0;
          const total = progress.total;
          const speed = elapsed > 0 ? completed / elapsed : 0;
          const remaining =
            total && speed > 0 ? (total - completed) / speed : null;

          // Throttle progress events to ~4/sec to avoid overwhelming the client
          const now = Date.now();
          if (now - lastEmitAt > 250 || completed === total) {
            send("progress", {
              status: progress.status,
              digest: progress.digest,
              total,
              completed,
              speed,
              etaSeconds: remaining,
            });
            lastEmitAt = now;
          }
        }
      } catch (err) {
        console.error("[ollama-pull] error:", err);
        send("error", {
          message:
            err instanceof Error ? err.message : "Failed to pull model",
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
