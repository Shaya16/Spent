CREATE TABLE budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL UNIQUE REFERENCES categories(id),
  monthly_amount REAL NOT NULL,
  is_auto INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_budgets_category ON budgets(category_id);

INSERT INTO settings (key, value) VALUES
  ('payday_day', '1');
