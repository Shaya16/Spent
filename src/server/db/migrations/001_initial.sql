CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  icon TEXT
);

INSERT INTO categories (name, color, icon) VALUES
  ('Groceries', '#8FAE8B', 'shopping-basket'),
  ('Restaurants', '#E29C7D', 'utensils-crossed'),
  ('Transport', '#85A8C4', 'tram-front'),
  ('Shopping', '#D8B681', 'shopping-bag'),
  ('Entertainment', '#D49AA0', 'ticket'),
  ('Health', '#7FB8A8', 'heart-pulse'),
  ('Education', '#9CA3D6', 'graduation-cap'),
  ('Bills & Utilities', '#AEA89A', 'receipt'),
  ('Subscriptions', '#B5A0CF', 'refresh-cw'),
  ('Travel', '#82B4C7', 'plane'),
  ('Cash & ATM', '#D8C281', 'banknote'),
  ('Transfers', '#A8AAB5', 'arrow-left-right'),
  ('Insurance', '#D69AA8', 'shield'),
  ('Home', '#C5A878', 'home'),
  ('Personal Care', '#D8A8CF', 'sparkles'),
  ('Other', '#B5B3AC', 'circle-dot');

CREATE TABLE bank_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL UNIQUE,
  credentials_encrypted BLOB NOT NULL,
  iv BLOB NOT NULL,
  auth_tag BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(dedup_hash, dedup_sequence)
);

CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_dedup_hash ON transactions(dedup_hash);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO settings (key, value) VALUES
  ('months_to_sync', '3'),
  ('ai_provider', 'none'),
  ('ai_ollama_url', 'http://localhost:11434'),
  ('ai_ollama_model', 'llama3.2:3b');
