import { NextResponse } from "next/server";
import {
  appendMessage,
  getThread,
  getThreadMessages,
  renameThread,
  type PersistedChatMessage,
} from "@/server/db/queries/chat";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import {
  createChatProvider,
  isChatAvailable,
} from "@/server/ai/chat-factory";
import { runAgent, type AgentSegment } from "@/server/ai/agent-loop";
import { buildSystemPrompt, TITLE_PROMPT_INSTRUCTIONS } from "@/server/ai/chat-prompts";
import { CHAT_TOOL_DESCRIPTORS } from "@/server/ai/chat-tools";
import { toLocalISODate } from "@/server/lib/date-utils";
import type { ChatBlock, ChatMessage } from "@/server/ai/chat-types";

function findLastAssistantIndex(segments: AgentSegment[]): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].role === "assistant" && segments[i].blocks.length > 0) {
      return i;
    }
  }
  return -1;
}

export const dynamic = "force-dynamic";

// How many of the most recent persisted messages we replay to the model.
// Keeps the context window predictable on long-running threads.
const HISTORY_WINDOW = 30;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function toChatMessage(msg: PersistedChatMessage): ChatMessage {
  return {
    role: msg.role,
    blocks: msg.blocks,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isFinite(threadId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const thread = getThread(workspaceId, threadId);
  if (!thread) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const messages = getThreadMessages(workspaceId, threadId);
  return NextResponse.json({ thread, messages });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isFinite(threadId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const thread = getThread(workspaceId, threadId);
  if (!thread) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: { text?: unknown };
  try {
    body = (await request.json()) as { text?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length === 0) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  if (!isChatAvailable()) {
    return NextResponse.json(
      {
        error:
          "AI provider not configured. Connect Claude or OpenAI in Settings to use the assistant.",
      },
      { status: 400 }
    );
  }

  const provider = createChatProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "Failed to initialise chat provider" },
      { status: 500 }
    );
  }

  // Persist the user message before kicking off the stream so the history
  // survives a disconnect mid-stream.
  const userMessage = appendMessage(workspaceId, threadId, {
    role: "user",
    blocks: [{ type: "text", text }],
  });

  const priorMessages = getThreadMessages(workspaceId, threadId).slice(
    -HISTORY_WINDOW
  );
  const conversation = priorMessages.map(toChatMessage);
  const isFirstExchange =
    priorMessages.filter((m) => m.role === "user").length === 1;

  const today = toLocalISODate(new Date());
  const systemPrompt = buildSystemPrompt({
    workspaceId,
    today,
    currency: "ILS",
    workspaceName: thread ? undefined : null,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      send("user-message", { message: userMessage });

      try {
        let segments: AgentSegment[] = [];
        let usage: { inputTokens?: number; outputTokens?: number } = {};

        for await (const event of runAgent({
          provider,
          systemPrompt,
          history: conversation,
          toolContext: { workspaceId, today },
          tools: CHAT_TOOL_DESCRIPTORS,
          signal: request.signal,
        })) {
          if (event.type === "text_delta") {
            send("text", { delta: event.text });
          } else if (event.type === "tool_use_start") {
            send("tool-start", {
              id: event.id,
              name: event.name,
              input: event.input,
            });
          } else if (event.type === "tool_use_end") {
            send("tool-end", {
              id: event.id,
              name: event.name,
              output: event.output,
              isError: event.isError,
              truncated: event.truncated,
            });
          } else if (event.type === "error") {
            send("error", { message: event.message });
          } else if (event.type === "done") {
            segments = event.segments;
            usage = event.usage;
          }
        }

        // Persist each agent segment as its own row so role/content stay
        // consistent on replay. Only the last assistant segment carries
        // provider/model/token usage; tool rows are provider-neutral.
        const lastAssistantIdx = findLastAssistantIndex(segments);
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          if (seg.blocks.length === 0) continue;
          const isLastAssistant =
            seg.role === "assistant" && i === lastAssistantIdx;
          const persisted = appendMessage(workspaceId, threadId, {
            role: seg.role,
            blocks: seg.blocks,
            provider: seg.role === "assistant" ? provider.id : null,
            model: seg.role === "assistant" ? provider.model : null,
            tokensIn: isLastAssistant ? (usage.inputTokens ?? null) : null,
            tokensOut: isLastAssistant ? (usage.outputTokens ?? null) : null,
          });
          send("assistant-message", { message: persisted });
        }

        if (isFirstExchange) {
          // Fire-and-forget title generation. Errors are swallowed so a flaky
          // model doesn't ruin the main response.
          const titleSeedBlocks = segments
            .filter((s) => s.role === "assistant")
            .flatMap((s) => s.blocks);
          generateTitle(provider, text, titleSeedBlocks)
            .then((title) => {
              if (title) {
                const updated = renameThread(workspaceId, threadId, title);
                if (updated) send("thread-updated", { thread: updated });
              }
            })
            .catch(() => {
              // ignore
            })
            .finally(() => {
              send("done", {});
              controller.close();
            });
          return;
        }

        send("done", {});
        controller.close();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Chat stream failed";
        send("error", { message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function generateTitle(
  provider: ReturnType<typeof createChatProvider>,
  userPrompt: string,
  assistantBlocks: ChatBlock[]
): Promise<string | null> {
  if (!provider) return null;
  const assistantText = assistantBlocks
    .map((b) => (b.type === "text" ? b.text : ""))
    .join(" ")
    .trim();
  const seed = `User asked: ${userPrompt.slice(0, 200)}
Assistant replied: ${assistantText.slice(0, 200)}

${TITLE_PROMPT_INSTRUCTIONS}`;

  let title = "";
  for await (const event of provider.stream({
    system:
      "You generate short conversation titles. Respond with the title only, nothing else.",
    tools: [],
    messages: [
      {
        role: "user",
        blocks: [{ type: "text", text: seed }],
      },
    ],
  })) {
    if (event.type === "text_delta") title += event.text;
    if (event.type === "message_stop") break;
    if (event.type === "error") return null;
  }
  const cleaned = title
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : null;
}
