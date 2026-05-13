ALTER TABLE categories
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense'
    CHECK(kind IN ('expense','income'));

INSERT INTO categories (name, color, icon, kind) VALUES
  ('Salary', '#85B59A', 'briefcase', 'income');

ALTER TABLE transactions
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense'
    CHECK(kind IN ('expense','income','transfer'));

UPDATE transactions
  SET kind = 'transfer'
  WHERE is_transfer = 1;

UPDATE transactions
  SET kind = 'income'
  WHERE is_transfer = 0
    AND charged_amount > 0
    AND provider IN ('hapoalim', 'leumi');

CREATE INDEX idx_transactions_kind ON transactions(kind);
CREATE INDEX idx_categories_kind ON categories(kind);

DROP INDEX IF EXISTS idx_transactions_is_transfer;
ALTER TABLE transactions DROP COLUMN is_transfer;
