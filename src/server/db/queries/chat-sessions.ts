import "server-only";

import type { UIMessage } from "ai";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { getDb } from "../index";
import { getOrm } from "../orm";
import { chatMessages, chatSessions } from "../schema";

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
  const row = getOrm()
    .select({
      id: chatSessions.id,
      workspaceId: chatSessions.workspaceId,
      title: chatSessions.title,
      titleSource: chatSessions.titleSource,
      createdAt: chatSessions.createdAt,
      updatedAt: chatSessions.updatedAt,
    })
    .from(chatSessions)
    .where(and(eq(chatSessions.workspaceId, workspaceId), eq(chatSessions.id, id)))
    .get();
  return row ?? null;
}

export function ensureChatSession(workspaceId: number, id: string): ChatSession {
  const normalizedId = id.trim();
  if (!normalizedId) throw new Error("chat session id is required");

  getOrm()
    .insert(chatSessions)
    .values({
      id: normalizedId,
      workspaceId,
      title: DEFAULT_TITLE,
      titleSource: "auto",
    })
    .onConflictDoNothing({ target: chatSessions.id })
    .run();

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

  getOrm()
    .update(chatSessions)
    .set({ title: normalized, titleSource: source, updatedAt: sql`datetime('now')` })
    .where(
      and(
        eq(chatSessions.workspaceId, workspaceId),
        eq(chatSessions.id, id),
        or(sql`${source} = 'manual'`, sql`${chatSessions.titleSource} != 'manual'`),
      ),
    )
    .run();

  return getChatSession(workspaceId, id);
}

export function deleteChatSession(workspaceId: number, id: string): boolean {
  const result = getOrm()
    .delete(chatSessions)
    .where(and(eq(chatSessions.workspaceId, workspaceId), eq(chatSessions.id, id)))
    .run();
  return result.changes > 0;
}

export function getChatMessages(workspaceId: number, sessionId: string): UIMessage[] | null {
  if (!getChatSession(workspaceId, sessionId)) return null;

  const rows = getOrm()
    .select({
      messageId: chatMessages.messageId,
      role: chatMessages.role,
      partsJson: chatMessages.partsJson,
    })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.position))
    .all();

  return rows.map((row) => ({
    id: row.messageId,
    role: row.role as UIMessage["role"],
    parts: JSON.parse(row.partsJson) as UIMessage["parts"],
  }));
}

export function replaceChatMessages(
  workspaceId: number,
  sessionId: string,
  messages: UIMessage[],
): void {
  ensureChatSession(workspaceId, sessionId);

  getOrm().transaction((tx) => {
    tx.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId)).run();
    messages.forEach((message, index) => {
      tx.insert(chatMessages)
        .values({
          sessionId,
          messageId: message.id,
          role: message.role,
          partsJson: JSON.stringify(message.parts),
          position: index,
        })
        .run();
    });
    tx.update(chatSessions)
      .set({ updatedAt: sql`datetime('now')` })
      .where(and(eq(chatSessions.workspaceId, workspaceId), eq(chatSessions.id, sessionId)))
      .run();
  });
}
