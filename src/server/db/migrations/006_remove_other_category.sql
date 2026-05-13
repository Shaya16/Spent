-- Drop the "Other" catch-all category. Its presence caused the AI to
-- shrug everything ambiguous into "Other" instead of either picking the
-- closest meaningful category or proposing a new one.
--
-- Any transactions currently assigned to "Other" go back to NULL so they
-- can be re-categorized by the AI on the next Categorize run (where new
-- categories can be proposed).
UPDATE transactions
SET category_id = NULL, category_source = NULL, updated_at = datetime('now')
WHERE category_id = (SELECT id FROM categories WHERE name = 'Other');

DELETE FROM categories WHERE name = 'Other';
