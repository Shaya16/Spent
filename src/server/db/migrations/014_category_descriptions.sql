-- Give the AI categorizer richer context per category. The categorizer
-- previously saw only bare names ("Groceries", "Education", ...) which
-- caused real-world misses on Hebrew merchants (e.g., a shooting range
-- routed to Education). Now each category carries a short description
-- with positive examples and anti-examples that get rendered into the
-- prompt.

ALTER TABLE categories ADD COLUMN description TEXT;

-- New category: Sports & Hobbies. Pre-seeded for every existing workspace.
-- Skips workspaces where a same-named category already exists (e.g., from
-- the AI proposal flow).
INSERT INTO categories (workspace_id, name, color, icon, kind, budget_mode, description)
SELECT w.id,
       'Sports & Hobbies',
       '#7BB36B',
       'dumbbell',
       'expense',
       'tracking',
       'Gyms, sports clubs, fitness studios, shooting ranges (מטווח/מטווחי), martial arts, climbing walls, hobby shops, craft supplies, musical instrument lessons, sports gear. NOT general entertainment.'
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM categories c
   WHERE c.workspace_id = w.id AND lower(c.name) = lower('Sports & Hobbies')
);

-- Curated descriptions for existing seeded categories. WHERE description IS NULL
-- so user edits made post-migration are preserved on re-runs of the seed.
UPDATE categories SET description = 'Supermarkets, grocery stores, food markets (Shufersal, Rami Levy, Yochananof, Victory, Tiv Taam, Mahane Yehuda vendors). NOT restaurants or prepared meals.'
  WHERE name = 'Groceries' AND description IS NULL;

UPDATE categories SET description = 'Sit-down restaurants, takeout, food delivery (Wolt, 10bis when itemized as restaurants), bars and pubs. NOT cafes for daily coffee (Coffee & Cafes) and NOT groceries.'
  WHERE name = 'Restaurants' AND description IS NULL;

UPDATE categories SET description = 'Coffee shops, cafes, bakeries, daily coffee runs (Aroma, Cafelix, Greg, Cofix). NOT restaurants.'
  WHERE name = 'Coffee & Cafes' AND description IS NULL;

UPDATE categories SET description = 'Public transport (Rav-Kav, Israel Railways), taxis (Gett, Yango), ride-share, fuel stations, parking, car washes, tolls. NOT car insurance (Insurance) and NOT travel airfare (Travel).'
  WHERE name = 'Transport' AND description IS NULL;

UPDATE categories SET description = 'General retail, clothing, electronics, household goods (Zara, H&M, IKEA, KSP, Castro). NOT groceries and NOT hobby-specific shops (Sports & Hobbies).'
  WHERE name = 'Shopping' AND description IS NULL;

UPDATE categories SET description = 'Cinemas, concerts, theater, museums, streaming events, gaming purchases, amusement parks. NOT subscription services (Subscriptions) and NOT sports/hobby activities (Sports & Hobbies).'
  WHERE name = 'Entertainment' AND description IS NULL;

UPDATE categories SET description = 'Pharmacies, doctors, dentists, clinics, lab tests, medical equipment, optical (Super-Pharm, Be Pharm, Clalit, Maccabi private clinics). NOT health insurance premiums (Insurance) and NOT gym memberships (Sports & Hobbies).'
  WHERE name = 'Health' AND description IS NULL;

UPDATE categories SET description = 'Hair salons, barbershops, beauty, nails, spa, cosmetics (Sephora). NOT gyms (Sports & Hobbies).'
  WHERE name = 'Personal Care' AND description IS NULL;

UPDATE categories SET description = 'Schools, universities, tuition, online courses (Coursera, Udemy, MasterClass), textbooks, school supplies, exam fees. NOT shooting ranges, gun training, or martial-arts classes (Sports & Hobbies) and NOT music lessons for fun (Sports & Hobbies).'
  WHERE name = 'Education' AND description IS NULL;

UPDATE categories SET description = 'Electricity, water, gas, internet, phone bills, municipal arnona, building vaad bayit. NOT streaming or software subscriptions (Subscriptions).'
  WHERE name = 'Bills & Utilities' AND description IS NULL;

UPDATE categories SET description = 'Recurring digital services: Netflix, Spotify, YouTube Premium, iCloud, Google One, SaaS tools, news subscriptions. NOT physical utility bills (Bills & Utilities).'
  WHERE name = 'Subscriptions' AND description IS NULL;

UPDATE categories SET description = 'Flights, hotels, Airbnb, vacation rentals, travel agencies, foreign-currency lodging, car rentals abroad. NOT daily transport (Transport).'
  WHERE name = 'Travel' AND description IS NULL;

UPDATE categories SET description = 'ATM withdrawals, cash advances, currency exchange. Often labeled bankomat / כספומט.'
  WHERE name = 'Cash & ATM' AND description IS NULL;

UPDATE categories SET description = 'Bank-to-bank transfers, Bit/PayBox to people, internal moves.'
  WHERE name = 'Transfers' AND description IS NULL;

UPDATE categories SET description = 'Car, home, health, life insurance premiums, leumit/menora/clal/migdal insurance lines. NOT medical visit copays (Health).'
  WHERE name = 'Insurance' AND description IS NULL;

UPDATE categories SET description = 'Furniture, appliances, repairs, hardware, gardening, home services (cleaners, handymen). NOT rent and NOT utilities.'
  WHERE name = 'Home' AND description IS NULL;

UPDATE categories SET description = 'Vet, pet food, pet supplies, pet grooming, pet boarding. NOT general food shopping.'
  WHERE name = 'Pet Care' AND description IS NULL;

UPDATE categories SET description = 'Charitable donations, gift purchases for others, tithing, fundraising contributions.'
  WHERE name = 'Gifts & Donations' AND description IS NULL;

UPDATE categories SET description = 'Daycare, babysitters, after-school programs, kids'' clothing/toys when clearly child-specific.'
  WHERE name = 'Kids & Childcare' AND description IS NULL;

-- Income categories
UPDATE categories SET description = 'Regular wage payments from employer (משכורת, שכר).'
  WHERE name = 'Salary' AND description IS NULL;

UPDATE categories SET description = 'Invoices paid by clients, side-gig deposits, consulting fees.'
  WHERE name = 'Freelance & Side Income' AND description IS NULL;

UPDATE categories SET description = 'Dividends, interest, stock sale proceeds, crypto sale proceeds.'
  WHERE name = 'Investment Income' AND description IS NULL;

UPDATE categories SET description = 'Returns, expense reimbursements, insurance payouts, refunds from cancellations.'
  WHERE name = 'Refunds & Reimbursements' AND description IS NULL;
