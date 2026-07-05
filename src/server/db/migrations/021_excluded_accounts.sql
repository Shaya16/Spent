CREATE TABLE excluded_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  credential_id INTEGER NOT NULL REFERENCES bank_credentials(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, credential_id, account_number)
);

CREATE INDEX idx_excluded_accounts_lookup
  ON excluded_accounts(workspace_id, credential_id, account_number);
