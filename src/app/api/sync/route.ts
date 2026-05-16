import {
  runAllWorkspaces,
  syncWorkspace,
  type WorkspaceSummary,
} from "@/server/sync/orchestrator";
import {
  getWorkspaceIdFromRequest,
  hasWorkspaceHeader,
} from "@/server/lib/workspace-context";
import { cancelOtpRequest } from "@/server/sync/otp-bridge";

function sseEvent(
  event: string,
  data: Record<string, unknown>
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    provider?: string;
  };

  // When the request includes X-Workspace-ID we sync only that workspace
  // (the in-app "Sync now" button). When it's absent we treat it as a
  // multi-workspace trigger from the menubar and sync every workspace.
  const headerPresent = hasWorkspaceHeader(request);

  const encoder = new TextEncoder();
  const pendingSyncRunIds = new Set<number>();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        // Track sync-run IDs that opened an OTP bridge so we can cancel any
        // outstanding waits if the SSE stream is aborted (user closes the tab,
        // hits cancel, etc.). cancelOtpRequest is a no-op for already-resolved
        // IDs, so over-cancelling is safe.
        if (event === "provider-2fa-needed") {
          const id = Number(data.syncRunId);
          if (Number.isFinite(id) && id > 0) pendingSyncRunIds.add(id);
        }
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      request.signal.addEventListener("abort", () => {
        for (const id of pendingSyncRunIds) {
          cancelOtpRequest(id, "Sync stream closed by client.");
        }
      });

      try {
        const summaries: WorkspaceSummary[] = [];
        if (headerPresent) {
          const workspaceId = getWorkspaceIdFromRequest(request);
          summaries.push(
            await syncWorkspace(workspaceId, body.provider, send)
          );
        } else {
          summaries.push(...(await runAllWorkspaces(body.provider, send)));
        }

        const totalAdded = summaries.reduce((s, w) => s + w.added, 0);
        const totalUpdated = summaries.reduce((s, w) => s + w.updated, 0);
        const totalCategorized = summaries.reduce(
          (s, w) => s + w.categorized,
          0
        );
        const firstWarning = summaries.find((w) => w.aiWarning)?.aiWarning ?? null;

        if (headerPresent && summaries.length === 1) {
          // Back-compat shape for the in-app sync UI which expects flat fields.
          const only = summaries[0];
          send("complete", {
            providers: only.providers,
            added: only.added,
            updated: only.updated,
            categorized: only.categorized,
            aiWarning: only.aiWarning,
            workspaceId: only.workspaceId,
            workspaceName: only.workspaceName,
          });
        } else {
          send("complete", {
            workspaces: summaries,
            added: totalAdded,
            updated: totalUpdated,
            categorized: totalCategorized,
            aiWarning: firstWarning,
          });
        }
      } catch (error) {
        console.error("[sync] unexpected error in sync route:", error);
        const message =
          error instanceof Error
            ? error.message.replace(/\b\d{5,}\b/g, "[REDACTED]")
            : "An unexpected error occurred";
        send("error", { message });
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
