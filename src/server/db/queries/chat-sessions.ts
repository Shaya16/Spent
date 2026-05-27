import "server-only";

import type { UIMessage } from "ai";
import { getDb } from "../index";

export interface ChatSession {
  id: string;
  workspaceId: number;
  title: string;
  titleSource: "auto" | "manual";
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionSummary extends ChatSession {
  messageCount: number;
}

interface ChatSessionRow {
  id: string;
  workspace_id: number;
  title: string;
  title_source: "auto" | "manual";
  created_at: string;
  updated_at: string;
  message_count?: number;
}

interface ChatMessageRow {
  message_id: string;
  role: UIMessage["role"];
  parts_json: string;
}

const DEFAULT_TITLE = "New chat";
const MAX_TITLE_LENGTH = 80;

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_LENGTH);
}

function mapSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    titleSource: row.title_source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSessionSummary(row: ChatSessionRow): ChatSessionSummary {
  return {
    ...mapSession(row),
    messageCount: row.message_count ?? 0,
  };
}

export function listChatSessions(workspaceId: number): ChatSessionSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.workspace_id, s.title, s.title_source, s.created_at, s.updated_at,
              COUNT(m.id) as message_count
       FROM chat_sessions s
       LEFT JOIN chat_messages m ON m.session_id = s.id
       WHERE s.workspace_id = ?
       GROUP BY s.id
       ORDER BY s.updated_at DESC, s.created_at DESC`,
    )
    .all(workspaceId) as ChatSessionRow[];
  return rows.map(mapSessionSummary);
}

export function getChatSession(workspaceId: number, id: string): ChatSession | null {
  const row = getDb()
    .prepare(
      `SELECT id, workspace_id, title, title_source, created_at, updated_at
       FROM chat_sessions
       WHERE workspace_id = ? AND id = ?`,
    )
    .get(workspaceId, id) as ChatSessionRow | undefined;
  return row ? mapSession(row) : null;
}

export function ensureChatSession(workspaceId: number, id: string): ChatSession {
  const normalizedId = id.trim();
  if (!normalizedId) throw new Error("chat session id is required");

  getDb()
    .prepare(
      `INSERT INTO chat_sessions (id, workspace_id, title, title_source)
       VALUES (?, ?, ?, 'auto')
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(normalizedId, workspaceId, DEFAULT_TITLE);

  const session = getChatSession(workspaceId, normalizedId);
  if (!session) throw new Error("chat session belongs to another workspace");
  return session;
}

export function updateChatSessionTitle(
  workspaceId: number,
  id: string,
  title: string,
  source: "auto" | "manual",
): ChatSession | null {
  const normalized = normalizeTitle(title);
  if (!normalized) return getChatSession(workspaceId, id);

  const result = getDb()
    .prepare(
      `UPDATE chat_sessions
       SET title = ?, title_source = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?
         AND (? = 'manual' OR title_source != 'manual')`,
    )
    .run(normalized, source, workspaceId, id, source);

  if (result.changes === 0) return getChatSession(workspaceId, id);
  return getChatSession(workspaceId, id);
}

export function deleteChatSession(workspaceId: number, id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM chat_sessions WHERE workspace_id = ? AND id = ?")
    .run(workspaceId, id);
  return result.changes > 0;
}

export function getChatMessages(workspaceId: number, sessionId: string): UIMessage[] | null {
  if (!getChatSession(workspaceId, sessionId)) return null;

  const rows = getDb()
    .prepare(
      `SELECT message_id, role, parts_json
       FROM chat_messages
       WHERE session_id = ?
       ORDER BY position ASC`,
    )
    .all(sessionId) as ChatMessageRow[];

  return rows.map((row) => ({
    id: row.message_id,
    role: row.role,
    parts: JSON.parse(row.parts_json) as UIMessage["parts"],
  }));
}

export function replaceChatMessages(
  workspaceId: number,
  sessionId: string,
  messages: UIMessage[],
): void {
  ensureChatSession(workspaceId, sessionId);

  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM chat_messages WHERE session_id = ?").run(sessionId);
    const insert = db.prepare(
      `INSERT INTO chat_messages (session_id, message_id, role, parts_json, position)
       VALUES (?, ?, ?, ?, ?)`,
    );
    messages.forEach((message, index) => {
      insert.run(sessionId, message.id, message.role, JSON.stringify(message.parts), index);
    });
    db.prepare(
      "UPDATE chat_sessions SET updated_at = datetime('now') WHERE workspace_id = ? AND id = ?",
    ).run(workspaceId, sessionId);
  })();
}
