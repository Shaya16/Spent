-- Workspaces: partition all user data by workspace_id so a single local user
-- can keep, e.g., Personal and Business finances isolated. No auth involved;
-- a workspace is a UI/data scope. AI provider config stays GLOBAL in the
-- `settings` table because the API key is a per-machine resource.

-- 1. workspaces table + the "Default" workspace that owns all existing data.
CREATE TABLE workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO workspaces (id, name, slug) VALUES (1, 'Default', 'default');

-- 2. workspace_settings: per-workspace key/value store. Migrate the three
--    keys that should be per-workspace out of the global `settings` table.
CREATE TABLE workspace_settings (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, key)
);

INSERT INTO workspace_settings (workspace_id, key, value)
  SELECT 1, key, value FROM settings
  WHERE key IN ('months_to_sync', 'payday_day', 'scraper_show_browser');

DELETE FROM settings
  WHERE key IN ('months_to_sync', 'payday_day', 'scraper_show_browser');

-- NOTE: every other table is recreated (not ALTERed) because SQLite refuses
-- `ALTER TABLE ... ADD COLUMN <fk> NOT NULL DEFAULT <value> REFERENCES ...`
-- (the rule is "no REFERENCES on an added column"). The recreate pattern
-- side-steps that limitation and gives us the chance to update UNIQUE
-- constraints at the same time.

-- 3. sync_runs: recreate to add workspace_id FK.
CREATE TABLE sync_runs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
  error_message TEXT,
  transactions_added INTEGER DEFAULT 0,
  transactions_updated INTEGER DEFAULT 0,
  scrape_from_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO sync_runs_new
  (id, workspace_id, provider, started_at, completed_at, status, error_message,
   transactions_added, transactions_updated, scrape_from_date, created_at)
  SELECT id, 1, provider, started_at, completed_at, status, error_message,
         transactions_added, transactions_updated, scrape_from_date, created_at
  FROM sync_runs;
DROP TABLE sync_runs;
ALTER TABLE sync_runs_new RENAME TO sync_runs;
CREATE INDEX idx_sync_runs_workspace ON sync_runs(workspace_id);

-- 4. categories: recreate to add workspace_id and swap UNIQUE(name)
--    -> UNIQUE(workspace_id, name).
CREATE TABLE categories_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT,
  kind TEXT NOT NULL DEFAULT 'expense' CHECK(kind IN ('expense','income')),
  budget_mode TEXT NOT NULL DEFAULT 'budgeted' CHECK(budget_mode IN ('budgeted','tracking')),
  UNIQUE(workspace_id, name)
);
INSERT INTO categories_new (id, workspace_id, name, color, icon, kind, budget_mode)
  SELECT id, 1, name, color, icon, kind, budget_mode FROM categories;
DROP TABLE categories;
ALTER TABLE categories_new RENAME TO categories;
CREATE INDEX idx_categories_workspace ON categories(workspace_id);
CREATE INDEX idx_categories_kind ON categories(kind);

-- 5. merchant_categories: recreate to add workspace_id and swap
--    UNIQUE(merchant_key) -> UNIQUE(workspace_id, merchant_key).
CREATE TABLE merchant_categories_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  merchant_key TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  kind TEXT NOT NULL CHECK(kind IN ('expense','income')),
  source TEXT NOT NULL CHECK(source IN ('user','approved-ai')),
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, merchant_key)
);
INSERT INTO merchant_categories_new
  (id, workspace_id, merchant_key, category_id, kind, source, hit_count, created_at, updated_at)
  SELECT id, 1, merchant_key, category_id, kind, source, hit_count, created_at, updated_at
  FROM merchant_categories;
DROP TABLE merchant_categories;
ALTER TABLE merchant_categories_new RENAME TO merchant_categories;
CREATE INDEX idx_merchant_categories_key ON merchant_categories(workspace_id, merchant_key);

-- 6. bank_credentials: recreate to swap UNIQUE(provider)
--    -> UNIQUE(workspace_id, provider).
CREATE TABLE bank_credentials_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  credentials_encrypted BLOB NOT NULL,
  iv BLOB NOT NULL,
  auth_tag BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, provider)
);
INSERT INTO bank_credentials_new
  (id, workspace_id, provider, credentials_encrypted, iv, auth_tag, created_at, updated_at)
  SELECT id, 1, provider, credentials_encrypted, iv, auth_tag, created_at, updated_at
  FROM bank_credentials;
DROP TABLE bank_credentials;
ALTER TABLE bank_credentials_new RENAME TO bank_credentials;
CREATE INDEX idx_bank_credentials_workspace ON bank_credentials(workspace_id);

-- 7. budgets: recreate to swap UNIQUE(category_id)
--    -> UNIQUE(workspace_id, category_id).
CREATE TABLE budgets_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  monthly_amount REAL NOT NULL,
  is_auto INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, category_id)
);
INSERT INTO budgets_new (id, workspace_id, category_id, monthly_amount, is_auto, created_at, updated_at)
  SELECT id, 1, category_id, monthly_amount, is_auto, created_at, updated_at FROM budgets;
DROP TABLE budgets;
ALTER TABLE budgets_new RENAME TO budgets;
CREATE INDEX idx_budgets_category ON budgets(workspace_id, category_id);

-- 8. transactions: full recreate. Column list mirrors the cumulative state
--    after migrations 001..012 (is_transfer was added in 007 and dropped
--    in 008, so it does not appear here). The UNIQUE key gains workspace_id
--    so that an identical fingerprint can legitimately appear in multiple
--    workspaces (e.g., the same bank connected twice).
CREATE TABLE transactions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  date TEXT NOT NULL,
  processed_date TEXT NOT NULL,
  original_amount REAL NOT NULL,
  original_currency TEXT NOT NULL,
  charged_amount REAL NOT NULL,
  charged_currency TEXT,
  description TEXT NOT NULL,
  memo TEXT,
  type TEXT NOT NULL CHECK(type IN ('normal','installments')),
  status TEXT NOT NULL CHECK(status IN ('completed','pending')),
  identifier TEXT,
  installment_number INTEGER,
  installment_total INTEGER,
  category_id INTEGER REFERENCES categories(id),
  category_source TEXT CHECK(category_source IN ('ai','user')),
  provider TEXT NOT NULL,
  sync_run_id INTEGER NOT NULL REFERENCES sync_runs(id),
  dedup_hash TEXT NOT NULL,
  dedup_sequence INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'expense' CHECK(kind IN ('expense','income','transfer')),
  needs_review INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, dedup_hash, dedup_sequence)
);
INSERT INTO transactions_new (
  id, workspace_id, account_number, date, processed_date, original_amount,
  original_currency, charged_amount, charged_currency, description, memo,
  type, status, identifier, installment_number, installment_total,
  category_id, category_source, provider, sync_run_id, dedup_hash,
  dedup_sequence, kind, needs_review, created_at, updated_at
)
SELECT
  id, 1, account_number, date, processed_date, original_amount,
  original_currency, charged_amount, charged_currency, description, memo,
  type, status, identifier, installment_number, installment_total,
  category_id, category_source, provider, sync_run_id, dedup_hash,
  dedup_sequence, kind, needs_review, created_at, updated_at
FROM transactions;
DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_dedup_hash ON transactions(dedup_hash);
CREATE INDEX idx_transactions_kind ON transactions(kind);
CREATE INDEX idx_transactions_needs_review ON transactions(needs_review);
CREATE INDEX idx_transactions_workspace ON transactions(workspace_id);
CREATE INDEX idx_transactions_workspace_date ON transactions(workspace_id, date);
