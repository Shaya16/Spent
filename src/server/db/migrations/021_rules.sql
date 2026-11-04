CREATE TABLE rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK(field IN ('merchant','amount','account')),
  op TEXT NOT NULL CHECK(op IN ('contains','equals','regex','gt','lt')),
  value TEXT NOT NULL CHECK(length(value) <= 200),
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  kind TEXT CHECK(kind IN ('expense','income','transfer')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(category_id IS NOT NULL OR kind IS NOT NULL)
);
CREATE INDEX idx_rules_workspace ON rules(workspace_id);
