"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import {
  History,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  useChatMessages,
  useChatStatus,
  useChatStream,
  useChatThreads,
  useCreateThread,
  useDeleteThread,
  type StreamingState,
} from "@/hooks/use-chat";
import type { ChatPersistedMessage, ChatThreadSummary } from "@/lib/api";
import { ChatMessage } from "./chat-message";
import { ToolCallCard } from "./tool-call-card";

const SUGGESTIONS = [
  "Summarise my spending this month",
  "What are my top 3 recurring charges?",
  "Compare my last 3 months of expenses",
  "Where could I cut back?",
];

interface ChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatDrawer({ open, onOpenChange }: ChatDrawerProps) {
  const status = useChatStatus();
  const threadsQuery = useChatThreads(open);
  const createThread = useCreateThread();
  const deleteThread = useDeleteThread();
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);

  // Auto-select the most recent thread the first time the drawer opens with
  // no active selection. Done via the "derived state" pattern (render-time)
  // to avoid the cascading-render lint warning on useEffect+setState.
  const [autoPickedFor, setAutoPickedFor] = useState<number | null>(null);
  const candidateThreadId =
    open && activeThreadId == null
      ? (threadsQuery.data?.[0]?.id ?? null)
      : null;
  if (candidateThreadId != null && autoPickedFor !== candidateThreadId) {
    setAutoPickedFor(candidateThreadId);
    setActiveThreadId(candidateThreadId);
  }

  // When the drawer is open but there are no threads at all, kick off a
  // fresh one. The mutation is a side effect (network), so it stays in an
  // effect; the resulting setActiveThreadId runs in the mutation's
  // onSuccess callback (event handler context), not synchronously.
  const initOnceRef = useRef(false);
  useEffect(() => {
    if (!open) {
      initOnceRef.current = false;
      return;
    }
    if (activeThreadId != null) return;
    if (initOnceRef.current) return;
    if (!status.data?.available) return;
    if (threadsQuery.data == null) return;
    if (threadsQuery.data.length > 0) return;
    if (createThread.isPending) return;
    initOnceRef.current = true;
    createThread.mutate(undefined, {
      onSuccess: (t) => setActiveThreadId(t.id),
    });
  }, [
    open,
    activeThreadId,
    status.data?.available,
    threadsQuery.data,
    createThread,
  ]);

  const messagesQuery = useChatMessages(activeThreadId);
  const stream = useChatStream({ threadId: activeThreadId });
  const activeThread = useMemo(
    () => threadsQuery.data?.find((t) => t.id === activeThreadId) ?? null,
    [threadsQuery.data, activeThreadId]
  );

  const handleNewChat = useCallback(() => {
    if (createThread.isPending) return;
    stream.cancel();
    createThread.mutate(undefined, {
      onSuccess: (t) => setActiveThreadId(t.id),
    });
  }, [createThread, stream]);

  const handleDeleteThread = useCallback(
    (id: number) => {
      deleteThread.mutate(id, {
        onSuccess: () => {
          if (id === activeThreadId) {
            stream.cancel();
            setActiveThreadId(null);
          }
        },
      });
    },
    [deleteThread, activeThreadId, stream]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md md:max-w-lg lg:max-w-xl"
      >
        <SheetHeader className="border-b px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Spent Assistant
              </SheetTitle>
              <SheetDescription className="mt-0.5 truncate">
                {activeThread?.title ?? "Ask anything about your finances"}
              </SheetDescription>
            </div>
            <div className="mr-8 flex items-center gap-1">
              {/*
                Keep some right margin so the menu trigger never sits flush
                against the Sheet's built-in close button - the previous
                layout made it very easy to misclick "close" when reaching
                for "new chat".
              */}
              <ThreadSwitcher
                threads={threadsQuery.data ?? []}
                activeId={activeThreadId}
                disabled={!status.data?.available}
                creatingThread={createThread.isPending}
                onSelect={(id) => {
                  stream.cancel();
                  setActiveThreadId(id);
                }}
                onNew={handleNewChat}
                onDelete={handleDeleteThread}
              />
            </div>
          </div>
        </SheetHeader>

        <div className="relative flex-1 overflow-y-auto">
          {!status.isLoading && status.data && !status.data.available && (
            <ChatUnavailable reason={status.data.reason} />
          )}

          {status.data?.available && (
            <ChatBody
              messages={messagesQuery.data?.messages ?? []}
              isLoading={messagesQuery.isLoading}
              optimisticUser={stream.optimisticUser}
              streaming={stream.streaming}
              error={stream.error}
              showSuggestions={
                !messagesQuery.isLoading &&
                (messagesQuery.data?.messages.length ?? 0) === 0 &&
                stream.optimisticUser == null
              }
              onSuggest={(text) => stream.send(text)}
            />
          )}
        </div>

        {status.data?.available && (
          <ChatComposer
            disabled={activeThreadId == null}
            isStreaming={stream.isStreaming}
            onSend={(text) => stream.send(text)}
            onCancel={() => stream.cancel()}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Sub-components

function ThreadSwitcher({
  threads,
  activeId,
  disabled,
  creatingThread,
  onSelect,
  onNew,
  onDelete,
}: {
  threads: ChatThreadSummary[];
  activeId: number | null;
  disabled: boolean;
  creatingThread: boolean;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label="Conversations menu"
          >
            <History />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onClick={onNew}
          disabled={creatingThread}
          className="font-medium"
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span>New conversation</span>
        </DropdownMenuItem>
        {threads.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {/*
              Base UI requires GroupLabel + Items to live under a Group root
              context, otherwise it throws at render time.
            */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>Recent</DropdownMenuLabel>
              {threads.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  className={cn(
                    "flex items-center justify-between gap-2",
                    t.id === activeId && "bg-accent"
                  )}
                  onClick={() => onSelect(t.id)}
                >
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(t.id);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${t.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChatUnavailable({
  reason,
}: {
  reason: "not-configured" | "missing-api-key" | "ollama-not-supported" | null;
}) {
  const copy = (() => {
    if (reason === "ollama-not-supported") {
      return {
        title: "Chat needs Claude or OpenAI",
        body: "The assistant relies on tool-calling, which is not reliable on Ollama models. Switch to Claude or OpenAI in Settings to enable it.",
      };
    }
    if (reason === "missing-api-key") {
      return {
        title: "API key missing",
        body: "You picked an AI provider but didn't save an API key. Add one to start chatting.",
      };
    }
    return {
      title: "Connect an AI provider",
      body: "The chat assistant runs on Claude or OpenAI. Configure one in Settings to start asking questions about your data.",
    };
  })();
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-6 w-6" />
      </div>
      <h3 className="font-serif text-lg">{copy.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
      <Button className="mt-4" render={<Link href="/settings/ai">Open Settings</Link>} />
    </div>
  );
}

function ChatBody({
  messages,
  isLoading,
  optimisticUser,
  streaming,
  error,
  showSuggestions,
  onSuggest,
}: {
  messages: ChatPersistedMessage[];
  isLoading: boolean;
  optimisticUser: ChatPersistedMessage | null;
  streaming: StreamingState | null;
  error: string | null;
  showSuggestions: boolean;
  onSuggest: (text: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, optimisticUser?.id, streaming?.text, streaming?.toolCalls.length]);

  // Build the tool-result lookup so each tool_use card can resolve its output.
  // We accept tool_result blocks from any message (canonical tool rows, and
  // legacy assistant rows from before the persistence fix that mixed them in).
  const toolResults = useMemo(() => {
    const map = new Map<string, { output: unknown; isError: boolean }>();
    for (const msg of messages) {
      for (const block of msg.blocks) {
        if (block.type === "tool_result") {
          map.set(block.toolUseId, {
            output: block.output,
            isError: block.isError === true,
          });
        }
      }
    }
    return map;
  }, [messages]);

  // Persisted user/assistant rows are shown in order, tool rows are folded
  // into the previous assistant message via toolResults.
  const visibleMessages = useMemo(
    () => messages.filter((m) => m.role !== "tool"),
    [messages]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation...
          </div>
        ) : (
          <>
            {visibleMessages.map((m) => (
              <ChatMessage key={m.id} message={m} toolResults={toolResults} />
            ))}

            {optimisticUser && (
              <ChatMessage
                key={`optimistic-${optimisticUser.id}`}
                message={optimisticUser}
                toolResults={toolResults}
              />
            )}

            {streaming && <StreamingBubble streaming={streaming} />}

            {showSuggestions && (
              <div className="px-4 pt-6">
                <div className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Try asking
                </div>
                <div className="grid gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onSuggest(s)}
                      className="rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="mx-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function StreamingBubble({ streaming }: { streaming: StreamingState }) {
  const hasOutput = streaming.text.length > 0 || streaming.toolCalls.length > 0;
  return (
    <div className="flex w-full px-4">
      <div className="w-full max-w-[95%] space-y-2 text-sm leading-relaxed">
        {streaming.toolCalls.map((call) => (
          <ToolCallCard
            key={call.id}
            name={call.name}
            input={call.input}
            status={call.status}
            output={call.output}
            truncated={call.truncated}
          />
        ))}
        {streaming.text.length > 0 ? (
          <p className="whitespace-pre-wrap">
            {streaming.text}
            <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-foreground/40 align-middle" />
          </p>
        ) : !hasOutput ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Thinking...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChatComposer({
  disabled,
  isStreaming,
  onSend,
  onCancel,
}: {
  disabled: boolean;
  isStreaming: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || isStreaming || disabled) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    });
  }, [value, isStreaming, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit]
  );

  // Auto-grow the textarea up to 6 lines.
  const onChange = useCallback((next: string) => {
    setValue(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      const max = 160;
      el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    });
  }, []);

  return (
    <div className="border-t bg-background/95 p-3 backdrop-blur">
      <div className="flex items-end gap-2 rounded-2xl border bg-card px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your finances..."
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none border-0 bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        {isStreaming ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            aria-label="Stop generation"
          >
            <Square />
          </Button>
        ) : (
          <Button
            size="icon-sm"
            onClick={submit}
            disabled={value.trim().length === 0 || disabled}
            aria-label="Send message"
          >
            <Send />
          </Button>
        )}
      </div>
      <div className="mt-1.5 px-2 text-[10px] text-muted-foreground">
        Enter to send · Shift+Enter for new line
      </div>
    </div>
  );
}
