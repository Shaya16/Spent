ALTER TABLE categories
  ADD COLUMN budget_mode TEXT NOT NULL DEFAULT 'budgeted'
    CHECK(budget_mode IN ('budgeted','tracking'));
