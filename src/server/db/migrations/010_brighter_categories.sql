-- Buttercream refresh: bump category color chroma by ~1.4x so each category
-- reads as its intended hue on the new lighter background. Values converted
-- from OKLCH targets (L 0.72-0.82, C 0.04-0.10, hue preserved per category).
UPDATE categories SET color = '#81B482' WHERE name = 'Groceries';
UPDATE categories SET color = '#E89B80' WHERE name = 'Restaurants';
UPDATE categories SET color = '#65AFD2' WHERE name = 'Transport';
UPDATE categories SET color = '#DCB87A' WHERE name = 'Shopping';
UPDATE categories SET color = '#E499A4' WHERE name = 'Entertainment';
UPDATE categories SET color = '#75BCA3' WHERE name = 'Health';
UPDATE categories SET color = '#94A0DD' WHERE name = 'Education';
UPDATE categories SET color = '#B8A98F' WHERE name = 'Bills & Utilities';
UPDATE categories SET color = '#AB9DDB' WHERE name = 'Subscriptions';
UPDATE categories SET color = '#64B8D2' WHERE name = 'Travel';
UPDATE categories SET color = '#DBC27F' WHERE name = 'Cash & ATM';
UPDATE categories SET color = '#A2AAC2' WHERE name = 'Transfers';
UPDATE categories SET color = '#E59A99' WHERE name = 'Insurance';
UPDATE categories SET color = '#D3A96F' WHERE name = 'Home';
UPDATE categories SET color = '#D5A4D7' WHERE name = 'Personal Care';
UPDATE categories SET color = '#B1AA9C' WHERE name = 'Other';
