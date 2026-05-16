import "server-only";

import OpenAI from "openai";
import type {
  ChatBlock,
  ChatMessage,
  ChatProvider,
  ChatStreamArgs,
  ChatStreamEvent,
  ToolDescriptor,
} from "../chat-types";

const MAX_OUTPUT_TOKENS = 4096;

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function toOpenAITools(tools: ToolDescriptor[]): OpenAITool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema ?? { type: "object", properties: {} },
    },
  }));
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

function blocksToOpenAIMessages(message: ChatMessage): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];

  if (message.role === "tool") {
    // Each tool_result block becomes its own role:tool message
    for (const block of message.blocks) {
      if (block.type !== "tool_result") continue;
      const content =
        typeof block.output === "string"
          ? block.output
          : JSON.stringify(block.output);
      out.push({
        role: "tool",
        tool_call_id: block.toolUseId,
        content,
      });
    }
    return out;
  }

  if (message.role === "assistant") {
    // Walk the blocks and emit alternating assistant/tool segments so legacy
    // rows that mixed multi-iteration content into one row are reconstructed
    // into a valid OpenAI history. OpenAI requires each tool_call to be
    // matched by a role:tool message that follows the assistant message.
    let pending: ChatBlock[] = [];
    let pendingKind: "assistant" | "tool" = "assistant";
    const flushAssistant = (blocks: ChatBlock[]) => {
      const textParts: string[] = [];
      const toolCalls: NonNullable<OpenAIMessage["tool_calls"]> = [];
      for (const block of blocks) {
        if (block.type === "text") {
          if (block.text.length > 0) textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments:
                typeof block.input === "string"
                  ? block.input
                  : JSON.stringify(block.input ?? {}),
            },
          });
        }
      }
      const msg: OpenAIMessage = { role: "assistant" };
      const text = textParts.join("");
      if (text.length > 0) msg.content = text;
      if (toolCalls.length > 0) msg.tool_calls = toolCalls;
      if (msg.content || msg.tool_calls) out.push(msg);
    };
    const flushTool = (blocks: ChatBlock[]) => {
      for (const block of blocks) {
        if (block.type !== "tool_result") continue;
        out.push({
          role: "tool",
          tool_call_id: block.toolUseId,
          content:
            typeof block.output === "string"
              ? block.output
              : JSON.stringify(block.output),
        });
      }
    };
    const flush = () => {
      if (pending.length === 0) return;
      if (pendingKind === "assistant") flushAssistant(pending);
      else flushTool(pending);
      pending = [];
    };
    for (const block of message.blocks) {
      const kind: "assistant" | "tool" =
        block.type === "tool_result" ? "tool" : "assistant";
      if (kind !== pendingKind) {
        flush();
        pendingKind = kind;
      }
      pending.push(block);
    }
    flush();
    return out;
  }

  // user / system
  const text = message.blocks
    .filter((b): b is Extract<ChatBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (text.length > 0) {
    out.push({ role: message.role === "system" ? "system" : "user", content: text });
  }
  return out;
}

function toOpenAIMessages(
  system: string,
  messages: ChatMessage[]
): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    out.push(...blocksToOpenAIMessages(m));
  }
  return out;
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  argsBuffer: string;
  emitted: boolean;
}

export class OpenAIChatProvider implements ChatProvider {
  readonly id = "openai" as const;
  readonly model: string;
  private client: OpenAI;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async *stream(args: ChatStreamArgs): AsyncIterable<ChatStreamEvent> {
    const tools = toOpenAITools(args.tools);
    const messages = toOpenAIMessages(args.system, args.messages);

    let stream;
    try {
      stream = await this.client.chat.completions.create(
        {
          model: this.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          stream: true,
          stream_options: { include_usage: true },
          // @ts-expect-error - SDK accepts plain message shapes at runtime
          messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? "auto" : undefined,
          parallel_tool_calls: false,
        },
        { signal: args.signal }
      );
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : "OpenAI request failed",
      };
      return;
    }

    const toolCalls = new Map<number, ToolCallAccumulator>();
    let stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop" | "other" =
      "end_turn";
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (choice) {
          const delta = choice.delta;
          if (delta?.content) {
            yield { type: "text_delta", text: delta.content };
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const acc =
                toolCalls.get(tc.index) ??
                ({ id: "", name: "", argsBuffer: "", emitted: false } as ToolCallAccumulator);
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.name = tc.function.name;
              if (tc.function?.arguments) acc.argsBuffer += tc.function.arguments;
              toolCalls.set(tc.index, acc);
            }
          }
          if (choice.finish_reason) {
            stopReason = mapFinishReason(choice.finish_reason);
          }
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
          outputTokens = chunk.usage.completion_tokens ?? outputTokens;
        }
      }
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : "OpenAI stream failed",
      };
      return;
    }

    // Emit any accumulated tool_use blocks now that the stream is complete.
    for (const acc of toolCalls.values()) {
      if (acc.emitted) continue;
      acc.emitted = true;
      let input: unknown = {};
      if (acc.argsBuffer.trim().length > 0) {
        try {
          input = JSON.parse(acc.argsBuffer);
        } catch {
          input = { _raw: acc.argsBuffer };
        }
      }
      yield {
        type: "tool_use",
        id: acc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
        name: acc.name,
        input,
      };
    }

    yield {
      type: "message_stop",
      stopReason,
      usage: { inputTokens, outputTokens },
    };
  }
}

function mapFinishReason(
  reason: string
): "end_turn" | "tool_use" | "max_tokens" | "stop" | "other" {
  if (reason === "tool_calls") return "tool_use";
  if (reason === "length") return "max_tokens";
  if (reason === "stop") return "end_turn";
  return "other";
}
