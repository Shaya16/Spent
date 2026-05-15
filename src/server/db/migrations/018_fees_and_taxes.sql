-- Add a "Fees & Taxes" leaf for bank charges, card fees, tax payments,
-- and government levies. These have no good home in the existing set:
-- they aren't bills, insurance, or discretionary spending. Group under
-- Money Movement since they're forced money flow, not real consumption.
INSERT OR IGNORE INTO categories
  (workspace_id, parent_id, name, color, icon, kind, budget_mode, description)
SELECT
  w.id,
  (SELECT id FROM categories
     WHERE workspace_id = w.id AND parent_id IS NULL AND name = 'Money Movement'),
  'Fees & Taxes',
  '#C29B6F',
  'landmark',
  'expense',
  'tracking',
  'Bank account fees, card annual fees, wire/transfer charges, tax payments, and government levies. NOT regular bills (Bills & Utilities) or insurance premiums (Insurance).'
FROM workspaces w;
