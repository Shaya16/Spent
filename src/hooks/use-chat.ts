"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createChatThread,
  deleteChatThread,
  getChatMessages,
  getChatStatus,
  listChatThreads,
  streamChat,
  type ChatBlock,
  type ChatPersistedMessage,
  type ChatStreamEvent,
} from "@/lib/api";

const THREADS_KEY = ["chat", "threads"] as const;
const MESSAGES_KEY = (id: number) => ["chat", "thread", id] as const;
const STATUS_KEY = ["chat", "status"] as const;

/**
 * Local working copy of the in-flight assistant turn. We append to this as
 * streaming events arrive so the UI can render token-by-token, and we replace
 * it with the canonical persisted message when the server tells us we're done.
 */
export interface StreamingState {
  text: string;
  toolCalls: Array<{
    id: string;
    name: string;
    input: unknown;
    status: "running" | "done" | "error";
    output?: unknown;
    truncated?: boolean;
  }>;
}

const EMPTY_STREAMING: StreamingState = { text: "", toolCalls: [] };

export function useChatStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: getChatStatus,
    staleTime: 30_000,
  });
}

export function useChatThreads(enabled: boolean) {
  return useQuery({
    queryKey: THREADS_KEY,
    queryFn: listChatThreads,
    enabled,
    staleTime: 5_000,
  });
}

export function useChatMessages(threadId: number | null) {
  return useQuery({
    queryKey: threadId == null ? ["chat", "thread", "none"] : MESSAGES_KEY(threadId),
    queryFn: () => getChatMessages(threadId as number),
    enabled: threadId != null,
  });
}

export function useCreateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => createChatThread(title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: THREADS_KEY });
    },
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteChatThread(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: THREADS_KEY });
    },
  });
}

interface UseChatStreamArgs {
  threadId: number | null;
}

interface UseChatStreamResult {
  send: (text: string) => void;
  cancel: () => void;
  streaming: StreamingState | null;
  isStreaming: boolean;
  optimisticUser: ChatPersistedMessage | null;
  error: string | null;
}

let _optimisticIdSeq = -1;
function nextOptimisticId(): number {
  _optimisticIdSeq -= 1;
  return _optimisticIdSeq;
}

export function useChatStream(args: UseChatStreamArgs): UseChatStreamResult {
  const { threadId } = args;
  const qc = useQueryClient();
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [optimisticUser, setOptimisticUser] = useState<ChatPersistedMessage | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  // Reset transient UI state when the active thread changes. We use the
  // render-time "derived state" pattern for the React state (avoids the
  // cascading-render lint warning), and a useEffect cleanup for the
  // mutable cancel-handle so refs aren't touched during render.
  const [lastThreadId, setLastThreadId] = useState<number | null>(threadId);
  if (lastThreadId !== threadId) {
    setLastThreadId(threadId);
    setStreaming(null);
    setOptimisticUser(null);
    setError(null);
  }
  useEffect(() => {
    // Cleanup fires when threadId changes or the hook unmounts.
    return () => {
      if (cancelRef.current) {
        cancelRef.current();
        cancelRef.current = null;
      }
    };
  }, [threadId]);

  const cancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setStreaming(null);
    setOptimisticUser(null);
  }, []);

  const send = useCallback(
    (text: string) => {
      if (threadId == null) return;
      if (cancelRef.current) cancelRef.current();
      setError(null);

      const optimistic: ChatPersistedMessage = {
        id: nextOptimisticId(),
        threadId,
        role: "user",
        blocks: [{ type: "text", text } as ChatBlock],
        provider: null,
        model: null,
        tokensIn: null,
        tokensOut: null,
        createdAt: new Date().toISOString(),
      };
      setOptimisticUser(optimistic);
      setStreaming({ ...EMPTY_STREAMING });

      const handle = streamChat(threadId, text, (event: ChatStreamEvent) => {
        if (event.type === "user-message") {
          // Replace the optimistic shell with the canonical record.
          setOptimisticUser(event.data.message);
        } else if (event.type === "text") {
          setStreaming((prev) => ({
            text: (prev?.text ?? "") + event.data.delta,
            toolCalls: prev?.toolCalls ?? [],
          }));
        } else if (event.type === "tool-start") {
          setStreaming((prev) => ({
            text: prev?.text ?? "",
            toolCalls: [
              ...(prev?.toolCalls ?? []),
              {
                id: event.data.id,
                name: event.data.name,
                input: event.data.input,
                status: "running" as const,
              },
            ],
          }));
        } else if (event.type === "tool-end") {
          setStreaming((prev) => {
            const list = (prev?.toolCalls ?? []).map((c) =>
              c.id === event.data.id
                ? {
                    ...c,
                    status: event.data.isError
                      ? ("error" as const)
                      : ("done" as const),
                    output: event.data.output,
                    truncated: event.data.truncated,
                  }
                : c
            );
            return { text: prev?.text ?? "", toolCalls: list };
          });
        } else if (event.type === "assistant-message") {
          qc.setQueryData<{ thread: unknown; messages: ChatPersistedMessage[] }>(
            MESSAGES_KEY(threadId),
            (prev) => {
              if (!prev) return prev;
              return {
                thread: prev.thread,
                messages: [...prev.messages, event.data.message],
              };
            }
          );
        } else if (event.type === "thread-updated") {
          qc.invalidateQueries({ queryKey: THREADS_KEY });
        } else if (event.type === "error") {
          setError(event.data.message);
        } else if (event.type === "done") {
          cancelRef.current = null;
          setStreaming(null);
          setOptimisticUser(null);
          // Make sure the canonical history is in sync once the stream completes.
          qc.invalidateQueries({ queryKey: MESSAGES_KEY(threadId) });
          qc.invalidateQueries({ queryKey: THREADS_KEY });
        }
      });
      cancelRef.current = handle.cancel;
    },
    [qc, threadId]
  );

  return {
    send,
    cancel,
    streaming,
    isStreaming: streaming != null,
    optimisticUser,
    error,
  };
}
