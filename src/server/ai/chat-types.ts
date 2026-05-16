import "server-only";

/**
 * Provider-neutral chat contract used by the assistant drawer.
 *
 * The shape mirrors Anthropic's blocks because they map cleanly to OpenAI's
 * tool_calls / tool messages too:
 *   - text         -> assistant text or user prompt
 *   - tool_use     -> assistant asks to invoke a registered tool
 *   - tool_result  -> the result of a previous tool_use, fed back to the model
 *
 * The categorization `AIProvider` in `./types.ts` is deliberately untouched.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ChatBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | {
      type: "tool_result";
      toolUseId: string;
      output: unknown;
      isError?: boolean;
    };

export interface ChatMessage {
  role: ChatRole;
  blocks: ChatBlock[];
}

export interface ToolDescriptor {
  name: string;
  description: string;
  /** JSON Schema, used as-is for both Anthropic tools and OpenAI function tools. */
  inputSchema: Record<string, unknown>;
}

/**
 * Events surfaced by `ChatProvider.stream`. The agent loop forwards
 * text_delta events to the SSE response and consumes tool_use to execute
 * tools and feed back tool_result blocks.
 */
export type ChatStreamEvent =
  | { type: "text_delta"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: unknown;
    }
  | {
      type: "message_stop";
      stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop" | "other";
      usage?: { inputTokens?: number; outputTokens?: number };
    }
  | { type: "error"; message: string };

export interface ChatStreamArgs {
  system: string;
  tools: ToolDescriptor[];
  messages: ChatMessage[];
  signal?: AbortSignal;
}

export interface ChatProvider {
  /** Identifier persisted alongside assistant messages (e.g. 'claude'). */
  readonly id: "claude" | "openai";
  readonly model: string;
  stream(args: ChatStreamArgs): AsyncIterable<ChatStreamEvent>;
}
