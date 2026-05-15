-- Two-level category hierarchy: a category may have an optional parent
-- (which must itself be a top-level category). Transactions only ever
-- attach to leaves; parents are aggregates. Existing rows migrate as
-- orphan leaves (parent_id IS NULL); the user assigns parents over time
-- via the Settings → Organize categories UI.
--
-- The 2-level invariant ("a parent must not itself have a parent") is
-- enforced at the application layer in setCategoryParent. SQLite cannot
-- express that as a pure DDL CHECK because CHECKs cannot reference other
-- rows. We add a self-FK with ON DELETE SET NULL so deleting a parent
-- demotes its children rather than cascading data loss, plus a CHECK to
-- prevent a row from being its own parent.

CREATE TABLE categories_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT,
  kind TEXT NOT NULL DEFAULT 'expense' CHECK(kind IN ('expense','income')),
  budget_mode TEXT NOT NULL DEFAULT 'budgeted'
    CHECK(budget_mode IN ('budgeted','tracking')),
  description TEXT,
  CHECK (parent_id IS NULL OR parent_id <> id),
  UNIQUE(workspace_id, name)
);

INSERT INTO categories_new
  (id, workspace_id, parent_id, name, color, icon, kind, budget_mode, description)
SELECT id, workspace_id, NULL, name, color, icon, kind, budget_mode, description
FROM categories;

DROP TABLE categories;
ALTER TABLE categories_new RENAME TO categories;

CREATE INDEX idx_categories_workspace ON categories(workspace_id);
CREATE INDEX idx_categories_kind ON categories(kind);
CREATE INDEX idx_categories_parent ON categories(parent_id);
