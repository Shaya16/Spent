-- Chat assistant: conversational threads with persisted history.
-- Threads and messages are scoped per-workspace and cascade-delete with the
-- parent workspace. Message content is stored as a JSON array of normalized
-- blocks: [{type:'text', text}], [{type:'tool_use', id, name, input}], and
-- [{type:'tool_result', toolUseId, output, isError?}]. Keeping the schema
-- provider-neutral lets us swap between Claude and OpenAI inside a single
-- conversation without touching the storage layer.

CREATE TABLE chat_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_chat_threads_workspace ON chat_threads(workspace_id, updated_at DESC);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
  content_json TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_chat_messages_thread ON chat_messages(thread_id, id);
