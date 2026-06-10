import "server-only";

import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";
import { createChatModel } from "@/server/ai/chat-model";
import { buildChatTools } from "@/server/ai/chat-tools";
import {
  ensureChatSession,
  replaceChatMessages,
} from "@/server/db/queries/chat-sessions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const maxDuration = 60;

function buildSystemPrompt(): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return `You are Spent, a friendly assistant inside a personal finance app for an Israeli user. The user's transactions, categories, and summaries are private and live in a local SQLite database that you can query through the provided tools.

Guidelines:
- Always call tools to get real data instead of guessing or fabricating numbers.
- Default currency is ILS (₪). Format amounts with at most two decimals and a thousands separator.
- Today's date in Asia/Jerusalem is ${today}.
- When the user references a relative period ("last month", "this year"), compute concrete YYYY-MM-DD ranges before calling tools.
- When you need a category id, call listCategories first.
- If the chat still has a generic title, call setChatTitle once with a concise title based on the first user message.
- Keep replies short and conversational. Use bullet points or small tables when listing multiple values.
- If a question is not about the user's finances, politely steer back to the app's purpose.`;
}

export async function POST(req: Request) {
  const model = createChatModel();
  if (!model) {
    return NextResponse.json(
      { error: "AI provider not configured" },
      { status: 400 }
    );
  }

  const workspaceId = getWorkspaceIdFromRequest(req);
  const { id, messages } = (await req.json()) as {
    id?: string;
    messages: UIMessage[];
  };
  if (!id) {
    return NextResponse.json({ error: "chat id is required" }, { status: 400 });
  }
  ensureChatSession(workspaceId, id);

  const result = streamText({
    model,
    system: buildSystemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: buildChatTools(workspaceId, id),
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: ({ messages: finishedMessages, isAborted }) => {
      if (!isAborted) {
        replaceChatMessages(workspaceId, id, finishedMessages);
      }
    },
  });
}
