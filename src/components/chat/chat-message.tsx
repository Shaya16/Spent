"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ChatBlock, ChatPersistedMessage } from "@/lib/api";
import { ToolCallCard } from "./tool-call-card";

interface ChatMessageProps {
  message: ChatPersistedMessage;
  /** Tool results keyed by tool_use id, so each tool_use card can show output. */
  toolResults: Map<string, { output: unknown; isError: boolean }>;
}

/**
 * Renders a single persisted message. User messages get a bubble, assistant
 * messages get the agent's text + inline tool-call cards. We deliberately
 * skip rendering `tool` rows on their own - their content is shown inside
 * the matching tool_use card.
 */
export function ChatMessage({ message, toolResults }: ChatMessageProps) {
  if (message.role === "tool") return null;

  const blocks = message.blocks;

  if (message.role === "user") {
    const text = blocks
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    return (
      <div className="flex justify-end px-4">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full px-4">
      <div className="w-full max-w-[95%] space-y-2 text-sm leading-relaxed">
        {blocks.map((block, idx) => (
          <RenderBlock
            key={`${message.id}-${idx}`}
            block={block}
            toolResults={toolResults}
          />
        ))}
      </div>
    </div>
  );
}

function RenderBlock({
  block,
  toolResults,
}: {
  block: ChatBlock;
  toolResults: Map<string, { output: unknown; isError: boolean }>;
}) {
  if (block.type === "text") {
    return <MarkdownText text={block.text} />;
  }
  if (block.type === "tool_use") {
    const result = toolResults.get(block.id);
    return (
      <ToolCallCard
        name={block.name}
        input={block.input}
        status={result ? (result.isError ? "error" : "done") : "running"}
        output={result?.output}
      />
    );
  }
  return null;
}

/**
 * Tiny markdown subset: paragraphs, bold (**text**), code (`text`), and
 * bullet/numbered lists. We deliberately avoid a full Markdown lib to keep
 * the bundle small for what is essentially a side drawer.
 */
function MarkdownText({ text }: { text: string }) {
  const segments = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="space-y-2">
      {segments.map((seg, i) => {
        if (seg.kind === "paragraph") {
          return (
            <p key={i} className="whitespace-pre-wrap">
              {renderInline(seg.text)}
            </p>
          );
        }
        return (
          <ul
            key={i}
            className={cn(
              "ml-5 list-outside space-y-1",
              seg.ordered ? "list-decimal" : "list-disc"
            )}
          >
            {seg.items.map((item, j) => (
              <li key={j}>{renderInline(item)}</li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}

type ParsedSegment =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

function parseMarkdown(input: string): ParsedSegment[] {
  const lines = input.split("\n");
  const segments: ParsedSegment[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join("\n").trim();
    if (text.length > 0) segments.push({ kind: "paragraph", text });
    paragraphBuffer = [];
  };
  const flushList = () => {
    if (listBuffer && listBuffer.items.length > 0) {
      segments.push({ kind: "list", ordered: listBuffer.ordered, items: listBuffer.items });
    }
    listBuffer = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bulletMatch || orderedMatch) {
      flushParagraph();
      const ordered = !!orderedMatch;
      const item = (bulletMatch?.[1] ?? orderedMatch?.[1] ?? "").trim();
      if (!listBuffer || listBuffer.ordered !== ordered) {
        flushList();
        listBuffer = { ordered, items: [] };
      }
      listBuffer.items.push(item);
      continue;
    }
    if (line.trim().length === 0) {
      flushList();
      flushParagraph();
      continue;
    }
    flushList();
    paragraphBuffer.push(line);
  }
  flushList();
  flushParagraph();
  return segments;
}

function renderInline(text: string): React.ReactNode {
  // Tokenize: **bold**, *italic*, `code`.
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <code
          key={`c-${keyIdx++}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(
        <em key={`i-${keyIdx++}`} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
