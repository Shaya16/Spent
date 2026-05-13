ALTER TABLE transactions
  ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_transactions_needs_review ON transactions(needs_review);

CREATE TABLE merchant_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_key TEXT NOT NULL UNIQUE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  kind TEXT NOT NULL CHECK(kind IN ('expense','income')),
  source TEXT NOT NULL CHECK(source IN ('user','approved-ai')),
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_merchant_categories_key ON merchant_categories(merchant_key);
