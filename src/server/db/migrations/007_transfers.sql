ALTER TABLE transactions
  ADD COLUMN is_transfer INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_transactions_is_transfer ON transactions(is_transfer);
