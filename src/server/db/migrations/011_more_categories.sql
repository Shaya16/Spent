-- Expand the seeded category list. Skip if a user already created any of
-- these names by hand (or via the AI proposal flow).
INSERT OR IGNORE INTO categories (name, color, icon, kind) VALUES
  ('Coffee & Cafes', '#A57B5B', 'coffee', 'expense'),
  ('Pet Care', '#6EBFB5', 'paw-print', 'expense'),
  ('Gifts & Donations', '#D67BAA', 'gift', 'expense'),
  ('Kids & Childcare', '#E5D080', 'baby', 'expense'),
  ('Freelance & Side Income', '#C0D582', 'briefcase', 'income'),
  ('Investment Income', '#7B85C9', 'trending-up', 'income'),
  ('Refunds & Reimbursements', '#7DC8B3', 'rotate-ccw', 'income');
