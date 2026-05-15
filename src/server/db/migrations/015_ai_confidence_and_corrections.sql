-- Two changes to support better AI categorization:
--
-- 1. Persist the AI's confidence (1-7 integer) per transaction so the UI
--    can surface it and so we can flag low-confidence rows for review.
-- 2. Add a corrections log: every time a user changes a category that the
--    AI picked, we record (merchant, wrong category, correct category).
--    The categorizer then replays these as anti-examples in future prompts
--    so the same merchant type doesn't get miscategorized again.

ALTER TABLE transactions ADD COLUMN ai_confidence INTEGER;

CREATE TABLE category_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  merchant_key TEXT NOT NULL,
  description TEXT NOT NULL,
  ai_category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  user_category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('expense','income')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_corrections_workspace_kind
  ON category_corrections(workspace_id, kind, created_at DESC);

-- One row per (workspace, merchant, wrong-category). Re-correcting the same
-- merchant pair just bumps the timestamp via ON CONFLICT in the query layer.
CREATE UNIQUE INDEX idx_corrections_unique
  ON category_corrections(workspace_id, merchant_key, ai_category_id);
