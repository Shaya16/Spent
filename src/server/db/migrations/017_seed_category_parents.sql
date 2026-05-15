-- Hard-coded parent groupings for expense categories. The user does not
-- assign parents per-category; instead, every seeded leaf has a fixed
-- canonical parent, baked in here AND mirrored in code (see
-- src/server/db/queries/categories.ts -> SEEDED_CATEGORY_PARENTS) so AI-
-- proposed new categories with known names get auto-grouped at apply time.
--
-- Income stays flat: 4 categories isn't worth grouping.
--
-- Idempotent: INSERT OR IGNORE skips parents that already exist (e.g.,
-- created manually during testing or by an earlier run of this migration).
-- The UPDATE step then re-points each named child at whichever Food/Lifestyle/
-- etc. row exists in that workspace.

-- Create one row per (workspace, parent name) at the top level.
INSERT OR IGNORE INTO categories
  (workspace_id, parent_id, name, color, icon, kind, budget_mode, description)
SELECT w.id, NULL, p.name, p.color, p.icon, 'expense', 'tracking', p.description
FROM workspaces w
CROSS JOIN (
  SELECT 'Food' AS name, '#E7A875' AS color, 'utensils-crossed' AS icon,
         'Rollup of food spending: groceries, restaurants, cafes.' AS description
  UNION ALL SELECT 'Transportation', '#7D90CA', 'tram-front',
         'Rollup of getting-around spending: daily commutes plus travel.'
  UNION ALL SELECT 'Lifestyle', '#D692BF', 'sparkles',
         'Rollup of discretionary spending: shopping, entertainment, personal care, hobbies.'
  UNION ALL SELECT 'Home & Bills', '#A4C386', 'home',
         'Rollup of recurring home expenses: bills, home upkeep, insurance, subscriptions.'
  UNION ALL SELECT 'Health & Family', '#65C1D1', 'heart-pulse',
         'Rollup of health and family spending: medical, education, childcare, pets.'
  UNION ALL SELECT 'Money Movement', '#A2ABBB', 'arrow-left-right',
         'Rollup of money-flow categories that aren''t pure spending: ATM, transfers, gifts.'
) AS p;

-- Backfill parent_id for each seeded child by name match within the same
-- workspace. Use a correlated subquery to resolve the parent's id per row.
UPDATE categories
SET parent_id = (
  SELECT p.id FROM categories p
  WHERE p.workspace_id = categories.workspace_id
    AND p.parent_id IS NULL
    AND p.name = CASE categories.name
      WHEN 'Groceries' THEN 'Food'
      WHEN 'Restaurants' THEN 'Food'
      WHEN 'Coffee & Cafes' THEN 'Food'
      WHEN 'Transport' THEN 'Transportation'
      WHEN 'Travel' THEN 'Transportation'
      WHEN 'Shopping' THEN 'Lifestyle'
      WHEN 'Entertainment' THEN 'Lifestyle'
      WHEN 'Personal Care' THEN 'Lifestyle'
      WHEN 'Sports & Hobbies' THEN 'Lifestyle'
      WHEN 'Bills & Utilities' THEN 'Home & Bills'
      WHEN 'Home' THEN 'Home & Bills'
      WHEN 'Insurance' THEN 'Home & Bills'
      WHEN 'Subscriptions' THEN 'Home & Bills'
      WHEN 'Health' THEN 'Health & Family'
      WHEN 'Education' THEN 'Health & Family'
      WHEN 'Kids & Childcare' THEN 'Health & Family'
      WHEN 'Pet Care' THEN 'Health & Family'
      WHEN 'Cash & ATM' THEN 'Money Movement'
      WHEN 'Transfers' THEN 'Money Movement'
      WHEN 'Gifts & Donations' THEN 'Money Movement'
      ELSE NULL
    END
)
WHERE name IN (
  'Groceries','Restaurants','Coffee & Cafes',
  'Transport','Travel',
  'Shopping','Entertainment','Personal Care','Sports & Hobbies',
  'Bills & Utilities','Home','Insurance','Subscriptions',
  'Health','Education','Kids & Childcare','Pet Care',
  'Cash & ATM','Transfers','Gifts & Donations'
) AND kind = 'expense';
