-- Re-color the seeded categories so each one has a clearly distinct hue.
-- Previous palette had clusters (3 similar pinks, 3 similar amber/tans,
-- 3 similar grays). This spreads them across the wheel.
UPDATE categories SET color = '#8FBC8A' WHERE name = 'Groceries';
UPDATE categories SET color = '#E29C71' WHERE name = 'Restaurants';
UPDATE categories SET color = '#6CA4C9' WHERE name = 'Transport';
UPDATE categories SET color = '#C779B2' WHERE name = 'Shopping';
UPDATE categories SET color = '#8C6AC7' WHERE name = 'Entertainment';
UPDATE categories SET color = '#5FB59E' WHERE name = 'Health';
UPDATE categories SET color = '#7682C5' WHERE name = 'Education';
UPDATE categories SET color = '#93A0B0' WHERE name = 'Bills & Utilities';
UPDATE categories SET color = '#B894D3' WHERE name = 'Subscriptions';
UPDATE categories SET color = '#6CC2C2' WHERE name = 'Travel';
UPDATE categories SET color = '#DBB85F' WHERE name = 'Cash & ATM';
UPDATE categories SET color = '#B0AB95' WHERE name = 'Transfers';
UPDATE categories SET color = '#BC6F62' WHERE name = 'Insurance';
UPDATE categories SET color = '#D78C5F' WHERE name = 'Home';
UPDATE categories SET color = '#E5A8C6' WHERE name = 'Personal Care';
UPDATE categories SET color = '#ADA396' WHERE name = 'Other';
