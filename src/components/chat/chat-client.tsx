"use client";

import { useChat } from "@ai-sdk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ArrowUp,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteChatSession, getChatSession, listChatSessions, renameChatSession } from "@/lib/api";
import type { ChatSession } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useActiveWorkspaceId } from "@/lib/workspace-store";

export function ChatClient() {
  const workspaceId = useActiveWorkspaceId();
  return <ChatWorkspace key={workspaceId ?? "none"} workspaceId={workspaceId} />;
}

function createChatId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `chat-${Date.now()}`;
}

function extractGeneratedTitle(messages: UIMessage[]): string | null {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type !== "tool-setChatTitle") continue;
      const toolPart = part as {
        state?: string;
        output?: { title?: unknown };
      };
      if (toolPart.state !== "output-available") continue;
      const title = toolPart.output?.title;
      if (typeof title === "string" && title.trim()) return title.trim();
    }
  }
  return null;
}

function ChatWorkspace({ workspaceId }: { workspaceId: number | null }) {
  const t = useTranslations("chat");
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState(createChatId);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

  const sessionsQuery = useQuery({
    queryKey: ["chatSessions", workspaceId],
    queryFn: listChatSessions,
    enabled: workspaceId != null,
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameChatSession(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatSessions", workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChatSession,
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ["chatSessions", workspaceId] });
      queryClient.removeQueries({ queryKey: ["chatSession", workspaceId, id] });
      if (id === activeSessionId) {
        startNewChat();
      }
    },
  });

  const { messages, sendMessage, status, stop, error, setMessages, clearError } = useChat({
    id: activeSessionId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: (): Record<string, string> =>
        workspaceId != null ? { "x-workspace-id": String(workspaceId) } : {},
    }),
    onFinish: () => {
      queryClient.invalidateQueries({ queryKey: ["chatSessions", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["chatSession", workspaceId, activeSessionId],
      });
    },
  });

  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastLiveTitleRef = useRef<string | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    if (workspaceId == null || messages.length === 0) return;

    const generatedTitle = extractGeneratedTitle(messages);
    const now = new Date().toISOString();
    queryClient.setQueryData<ChatSession[]>(["chatSessions", workspaceId], (current) => {
      const sessions = current ?? [];
      const existing = sessions.find((session) => session.id === activeSessionId);
      if (!existing) {
        return [
          {
            id: activeSessionId,
            workspaceId,
            title: generatedTitle ?? "New chat",
            titleSource: "auto",
            messageCount: messages.length,
            createdAt: now,
            updatedAt: now,
          },
          ...sessions,
        ];
      }

      return sessions.map((session) => {
        if (session.id !== activeSessionId) return session;
        const title =
          generatedTitle && session.titleSource !== "manual" ? generatedTitle : session.title;
        return {
          ...session,
          title,
          messageCount: messages.length,
          updatedAt: now,
        };
      });
    });

    if (generatedTitle && generatedTitle !== lastLiveTitleRef.current) {
      lastLiveTitleRef.current = generatedTitle;
      queryClient.invalidateQueries({ queryKey: ["chatSessions", workspaceId] });
    }
  }, [activeSessionId, messages, queryClient, workspaceId]);

  const isBusy = status === "submitted" || status === "streaming";

  function submit() {
    const text = input.trim();
    if (!text || isBusy) return;
    clearError();
    sendMessage({ text });
    setInput("");
  }

  function startNewChat() {
    setInitialMessages([]);
    setActiveSessionId(createChatId());
    setMessages([]);
    setInput("");
  }

  async function selectSession(id: string) {
    const data = await queryClient.fetchQuery({
      queryKey: ["chatSession", workspaceId, id],
      queryFn: () => getChatSession(id),
    });
    setInitialMessages(data.messages);
    setActiveSessionId(id);
    setMessages(data.messages);
    setInput("");
  }

  function renameSession(session: ChatSession) {
    const title = window.prompt(t("renamePrompt"), session.title);
    if (title == null || !title.trim()) return;
    renameMutation.mutate({ id: session.id, title });
  }

  function removeSession(session: ChatSession) {
    if (!window.confirm(t("deleteConfirm", { title: session.title }))) return;
    deleteMutation.mutate(session.id);
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        meta={t("meta")}
        actions={
          messages.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={startNewChat} disabled={isBusy}>
              <Plus className="h-3.5 w-3.5" />
              {t("newChat")}
            </Button>
          ) : null
        }
      />

      <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col md:h-[calc(100dvh-4rem)] md:flex-row">
        <ChatHistory
          sessions={sessionsQuery.data ?? []}
          activeSessionId={activeSessionId}
          loading={sessionsQuery.isLoading}
          busy={isBusy}
          onNew={startNewChat}
          onSelect={(id) => void selectSession(id)}
          onRename={renameSession}
          onDelete={removeSession}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 pb-4 pt-6 md:px-6 lg:px-8">
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.length === 0 && (
                <EmptyState
                  suggestions={[t("suggest1"), t("suggest2"), t("suggest3"), t("suggest4")]}
                  onPick={(s) => {
                    clearError();
                    setInput("");
                    sendMessage({ text: s });
                  }}
                  busy={isBusy}
                />
              )}

              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              {status === "submitted" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("thinking")}
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
                  {t("error")}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-border/40 bg-background/80 px-4 py-3 backdrop-blur md:px-6 lg:px-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="mx-auto flex max-w-3xl items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => {
                  clearError();
                  setInput(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={t("composerPlaceholder")}
                rows={1}
                className="max-h-48 min-h-[44px] flex-1 resize-none rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm shadow-sm outline-none ring-foreground/10 focus:ring-2"
              />
              {isBusy ? (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={() => stop()}
                  aria-label={t("stop")}
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" size="icon" disabled={!input.trim()} aria-label={t("send")}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )}
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

function ChatHistory({
  sessions,
  activeSessionId,
  loading,
  busy,
  onNew,
  onSelect,
  onRename,
  onDelete,
}: {
  sessions: ChatSession[];
  activeSessionId: string;
  loading: boolean;
  busy: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (session: ChatSession) => void;
  onDelete: (session: ChatSession) => void;
}) {
  const t = useTranslations("chat");
  return (
    <aside className="flex max-h-40 shrink-0 flex-col border-b border-border/40 bg-muted/20 md:max-h-none md:w-64 md:border-b-0 md:border-e">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("history")}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onNew}
          disabled={busy}
          aria-label={t("newChat")}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex min-h-0 gap-1 overflow-x-auto px-2 pb-2 md:flex-1 md:flex-col md:overflow-y-auto md:overflow-x-hidden">
        {loading ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">{t("historyLoading")}</div>
        ) : sessions.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">{t("historyEmpty")}</div>
        ) : (
          sessions.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                className={cn(
                  "group flex min-w-52 items-center gap-1 rounded-md md:min-w-0",
                  active && "bg-accent",
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-md px-2 py-2 text-start text-sm hover:bg-accent",
                    active && "font-medium",
                  )}
                  onClick={() => onSelect(session.id)}
                  disabled={busy}
                >
                  {session.title}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="me-1 opacity-70 group-hover:opacity-100"
                        aria-label={t("sessionActions")}
                      />
                    }
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={() => onRename(session)}>
                      <Pencil className="h-3.5 w-3.5" />
                      {t("rename")}
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete(session)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "whitespace-pre-wrap bg-primary text-primary-foreground"
            : "overflow-x-auto bg-card ring-1 ring-foreground/10",
        )}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return isUser ? (
              <span key={i}>{part.text}</span>
            ) : (
              <MarkdownText key={i}>{part.text ?? ""}</MarkdownText>
            );
          }
          if (part.type.startsWith("tool-")) {
            const name = part.type.slice("tool-".length);
            if (name === "setChatTitle") return null;
            return (
              <span
                key={i}
                className="my-1 inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
              >
                <MessageSquare className="h-3 w-3" />
                {name}
              </span>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function MarkdownText({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="mb-2 list-disc space-y-1 ps-5 last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 list-decimal space-y-1 ps-5 last:mb-0">{children}</ol>
        ),
        li: ({ children }) => <li className="ps-1">{children}</li>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            {children}
          </a>
        ),
        code: ({ children, className }) => (
          <code className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]", className)}>
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto rounded-md bg-muted p-3 text-xs last:mb-0">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <table className="mb-2 w-full min-w-max border-collapse text-start text-xs last:mb-0">
            {children}
          </table>
        ),
        th: ({ children }) => (
          <th className="border-b border-border px-2 py-1 text-start font-semibold">{children}</th>
        ),
        td: ({ children }) => <td className="border-b border-border/60 px-2 py-1">{children}</td>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function EmptyState({
  suggestions,
  onPick,
  busy,
}: {
  suggestions: string[];
  onPick: (s: string) => void;
  busy: boolean;
}) {
  const t = useTranslations("chat");
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 pt-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h2 className="font-serif text-2xl tracking-tight">{t("emptyTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("emptyBody")}</p>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => onPick(s)}
            className="rounded-xl border border-border/60 bg-card px-4 py-3 text-start text-sm leading-snug ring-foreground/10 transition hover:bg-accent disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
