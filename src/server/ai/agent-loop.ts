import "server-only";

import type {
  ChatBlock,
  ChatMessage,
  ChatProvider,
  ToolDescriptor,
} from "./chat-types";
import { CHAT_TOOLS, findTool, type ToolContext } from "./chat-tools";

const MAX_ITERATIONS = 6;
const MAX_TOOL_RESULT_BYTES = 16 * 1024;

/**
 * A persistable slice of the assistant turn. We keep assistant text/tool_use
 * blocks separate from tool_result blocks so the persistence layer can store
 * them with the correct role - mixing them in one row violates the Anthropic
 * API contract (tool_result must live in user-role messages on replay).
 */
export interface AgentSegment {
  role: "assistant" | "tool";
  blocks: ChatBlock[];
}

export type AgentEvent =
  | { type: "text_delta"; text: string }
  | {
      type: "tool_use_start";
      id: string;
      name: string;
      input: unknown;
    }
  | {
      type: "tool_use_end";
      id: string;
      name: string;
      output: unknown;
      isError: boolean;
      truncated: boolean;
    }
  | {
      type: "done";
      segments: AgentSegment[];
      usage: { inputTokens?: number; outputTokens?: number };
    }
  | { type: "error"; message: string };

export interface RunAgentOptions {
  provider: ChatProvider;
  systemPrompt: string;
  history: ChatMessage[];
  toolContext: ToolContext;
  /** Optional whitelist; defaults to the full registry. */
  tools?: ToolDescriptor[];
  signal?: AbortSignal;
}

function truncateOutput(value: unknown): { value: unknown; truncated: boolean } {
  const json = typeof value === "string" ? value : JSON.stringify(value);
  if (json.length <= MAX_TOOL_RESULT_BYTES) {
    return { value, truncated: false };
  }
  const truncated = json.slice(0, MAX_TOOL_RESULT_BYTES);
  return {
    value: {
      _truncated: true,
      _originalBytes: json.length,
      _kept: truncated.length,
      preview: truncated,
    },
    truncated: true,
  };
}

/**
 * Drives the conversation:
 *   provider.stream -> if tool_use blocks come back, execute them and feed
 *   the tool_result back to the provider, until the assistant ends its turn
 *   or we hit the iteration ceiling.
 *
 * Yields incremental events for the SSE response and finishes with a `done`
 * event carrying the final assistant message blocks ready to persist.
 */
export async function* runAgent(
  options: RunAgentOptions
): AsyncIterable<AgentEvent> {
  const tools = options.tools ?? CHAT_TOOLS.map((t) => t.descriptor);
  const conversation: ChatMessage[] = [...options.history];
  const segments: AgentSegment[] = [];
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const turnBlocks: ChatBlock[] = [];
    const pendingToolUses: { id: string; name: string; input: unknown }[] = [];
    let textBuffer = "";
    let stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop" | "other" =
      "end_turn";
    let hadError = false;

    for await (const event of options.provider.stream({
      system: options.systemPrompt,
      tools,
      messages: conversation,
      signal: options.signal,
    })) {
      if (event.type === "text_delta") {
        textBuffer += event.text;
        yield { type: "text_delta", text: event.text };
      } else if (event.type === "tool_use") {
        if (textBuffer.length > 0) {
          turnBlocks.push({ type: "text", text: textBuffer });
          textBuffer = "";
        }
        turnBlocks.push({
          type: "tool_use",
          id: event.id,
          name: event.name,
          input: event.input,
        });
        pendingToolUses.push({
          id: event.id,
          name: event.name,
          input: event.input,
        });
      } else if (event.type === "message_stop") {
        if (textBuffer.length > 0) {
          turnBlocks.push({ type: "text", text: textBuffer });
          textBuffer = "";
        }
        stopReason = event.stopReason;
        if (event.usage) {
          if (event.usage.inputTokens != null) {
            inputTokens = (inputTokens ?? 0) + event.usage.inputTokens;
          }
          if (event.usage.outputTokens != null) {
            outputTokens = (outputTokens ?? 0) + event.usage.outputTokens;
          }
        }
      } else if (event.type === "error") {
        hadError = true;
        yield { type: "error", message: event.message };
      }
    }

    if (hadError) {
      // Provider already reported the error; bail out and persist whatever we have.
      if (turnBlocks.length > 0) {
        segments.push({ role: "assistant", blocks: turnBlocks });
      }
      break;
    }

    if (turnBlocks.length > 0) {
      segments.push({ role: "assistant", blocks: turnBlocks });
      conversation.push({ role: "assistant", blocks: turnBlocks });
    }

    if (pendingToolUses.length === 0 || stopReason !== "tool_use") {
      break;
    }

    const toolResultBlocks: ChatBlock[] = [];
    for (const call of pendingToolUses) {
      const tool = findTool(call.name);
      yield {
        type: "tool_use_start",
        id: call.id,
        name: call.name,
        input: call.input,
      };
      let output: unknown;
      let isError = false;
      if (!tool) {
        output = { error: `Unknown tool '${call.name}'` };
        isError = true;
      } else {
        try {
          output = await tool.execute(call.input ?? {}, options.toolContext);
        } catch (err) {
          isError = true;
          output = {
            error:
              err instanceof Error
                ? err.message
                : "Tool execution failed",
          };
        }
      }
      const { value: safeOutput, truncated } = truncateOutput(output);
      toolResultBlocks.push({
        type: "tool_result",
        toolUseId: call.id,
        output: safeOutput,
        isError,
      });
      yield {
        type: "tool_use_end",
        id: call.id,
        name: call.name,
        output: safeOutput,
        isError,
        truncated,
      };
    }

    if (toolResultBlocks.length > 0) {
      segments.push({ role: "tool", blocks: toolResultBlocks });
      conversation.push({ role: "tool", blocks: toolResultBlocks });
    }
  }

  yield {
    type: "done",
    segments,
    usage: { inputTokens, outputTokens },
  };
}
