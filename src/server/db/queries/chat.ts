import "server-only";

import { getDb } from "../index";
import type { ChatBlock } from "@/server/ai/chat-types";

export interface ChatThreadSummary {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatThread {
  id: number;
  workspaceId: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedChatMessage {
  id: number;
  threadId: number;
  role: "user" | "assistant" | "tool";
  blocks: ChatBlock[];
  provider: "claude" | "openai" | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
}

export function listThreads(workspaceId: number): ChatThreadSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.title, t.created_at as createdAt, t.updated_at as updatedAt,
              (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id = t.id) as messageCount
       FROM chat_threads t
       WHERE t.workspace_id = ?
       ORDER BY t.updated_at DESC, t.id DESC`
    )
    .all(workspaceId) as ChatThreadSummary[];
  return rows;
}

export function createThread(workspaceId: number, title?: string): ChatThread {
  const result = getDb()
    .prepare(
      `INSERT INTO chat_threads (workspace_id, title) VALUES (?, ?)`
    )
    .run(workspaceId, title?.trim() && title.trim().length > 0 ? title.trim() : "New chat");
  return getThread(workspaceId, Number(result.lastInsertRowid))!;
}

export function getThread(
  workspaceId: number,
  threadId: number
): ChatThread | null {
  const row = getDb()
    .prepare(
      `SELECT id, workspace_id as workspaceId, title,
              created_at as createdAt, updated_at as updatedAt
       FROM chat_threads WHERE workspace_id = ? AND id = ?`
    )
    .get(workspaceId, threadId) as ChatThread | undefined;
  return row ?? null;
}

export function renameThread(
  workspaceId: number,
  threadId: number,
  title: string
): ChatThread | null {
  const trimmed = title.trim();
  if (trimmed.length === 0) return getThread(workspaceId, threadId);
  getDb()
    .prepare(
      `UPDATE chat_threads
       SET title = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(trimmed.slice(0, 200), workspaceId, threadId);
  return getThread(workspaceId, threadId);
}

export function deleteThread(workspaceId: number, threadId: number): boolean {
  const result = getDb()
    .prepare(
      `DELETE FROM chat_threads WHERE workspace_id = ? AND id = ?`
    )
    .run(workspaceId, threadId);
  return result.changes > 0;
}

export function touchThread(workspaceId: number, threadId: number): void {
  getDb()
    .prepare(
      `UPDATE chat_threads SET updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(workspaceId, threadId);
}

interface RawMessageRow {
  id: number;
  thread_id: number;
  role: "user" | "assistant" | "tool";
  content_json: string;
  provider: "claude" | "openai" | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
}

function mapMessage(row: RawMessageRow): PersistedChatMessage {
  let blocks: ChatBlock[] = [];
  try {
    const parsed = JSON.parse(row.content_json);
    if (Array.isArray(parsed)) blocks = parsed as ChatBlock[];
  } catch {
    // Corrupt row: treat as empty so we don't blow up the whole conversation.
  }
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    blocks,
    provider: row.provider,
    model: row.model,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    createdAt: row.created_at,
  };
}

export function getThreadMessages(
  workspaceId: number,
  threadId: number
): PersistedChatMessage[] {
  // Confirm the thread belongs to the workspace before returning anything.
  const owned = getThread(workspaceId, threadId);
  if (!owned) return [];
  const rows = getDb()
    .prepare(
      `SELECT id, thread_id, role, content_json, provider, model,
              tokens_in, tokens_out, created_at
       FROM chat_messages WHERE thread_id = ? ORDER BY id ASC`
    )
    .all(threadId) as RawMessageRow[];
  return rows.map(mapMessage);
}

export interface AppendMessageInput {
  role: "user" | "assistant" | "tool";
  blocks: ChatBlock[];
  provider?: "claude" | "openai" | null;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
}

export function appendMessage(
  workspaceId: number,
  threadId: number,
  input: AppendMessageInput
): PersistedChatMessage {
  const owned = getThread(workspaceId, threadId);
  if (!owned) {
    throw new Error("Thread not found in this workspace");
  }
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO chat_messages
         (thread_id, role, content_json, provider, model, tokens_in, tokens_out)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      threadId,
      input.role,
      JSON.stringify(input.blocks),
      input.provider ?? null,
      input.model ?? null,
      input.tokensIn ?? null,
      input.tokensOut ?? null
    );
  db.prepare(
    `UPDATE chat_threads SET updated_at = datetime('now') WHERE id = ?`
  ).run(threadId);
  const row = db
    .prepare(
      `SELECT id, thread_id, role, content_json, provider, model,
              tokens_in, tokens_out, created_at
       FROM chat_messages WHERE id = ?`
    )
    .get(Number(result.lastInsertRowid)) as RawMessageRow;
  return mapMessage(row);
}
