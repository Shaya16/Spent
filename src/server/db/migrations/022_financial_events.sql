-- Financial Events: a first-class, auditable, reversible grouping layer over
-- transactions. The same real-world money movement (an internal transfer, a
-- credit card bill payment, an ATM withdrawal) shows up as N rows once several
-- accounts are aggregated. Today that is flattened with the opaque `kind` flag
-- set by detectKind (src/server/lib/transfers.ts) and findInternalTransferPairs
-- (src/server/lib/internal-transfers.ts). This layer groups the participating
-- rows into one event, records its type, a canonical row for reporting, a
-- confidence score, and human-readable reasons, while leaving `kind`, the exact
-- dedup (dedup_hash / dedup_sequence), and every reporting query intact.
--
-- Additive only: no table dropped, no column removed. Pair reconstruction runs
-- in TypeScript at sync time (see src/server/sync/matching-step.ts), NOT here,
-- so the runner's closing foreign_key_check never sees a half-written link.
-- See docs/transaction-deduplication-design.md for the full design.

-- 1. The event: one real-world money movement composed of N transaction rows.
CREATE TABLE financial_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  event_type    TEXT NOT NULL CHECK (event_type IN (
                  'internal_transfer',      -- account A debit <-> account B credit (1:1)
                  'credit_card_payment',    -- bank-side bill payment (1 leg, or 1:1 with a card credit)
                  'credit_card_statement',  -- one bank bill <-> N card purchases (N:1)
                  'atm_withdrawal',         -- cash leaving a tracked account (single leg)
                  'loan_repayment',         -- checking -> loan account
                  'investment_transfer',    -- checking -> brokerage account
                  'refund_reversal',        -- a credit reversing an earlier purchase
                  'fee',                    -- a standalone or attached fee row
                  'duplicate')),            -- pending<->posted or re-pull artifact

  -- The single member projected by per-event reporting, or NULL when the event
  -- contributes nothing to spend (every grouping event here uses NULL).
  canonical_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,

  status        TEXT NOT NULL DEFAULT 'suggested'
                  CHECK (status IN ('suggested','confirmed','rejected')),

  -- heuristic = the matcher, rule = a match_rules override fired, user = manual,
  -- ai = an LLM suggestion.
  source        TEXT NOT NULL DEFAULT 'heuristic'
                  CHECK (source IN ('heuristic','rule','user','ai')),

  -- Match probability in [0,1]. A score, not money, so REAL is correct.
  confidence    REAL NOT NULL DEFAULT 1.0
                  CHECK (confidence >= 0 AND confidence <= 1),

  -- JSON array of human-readable reasons. JSON1 ships with better-sqlite3.
  reasons       TEXT CHECK (reasons IS NULL OR json_valid(reasons)),

  -- Idempotency key (the events-layer analogue of UNIQUE(dedup_hash, sequence)).
  -- Derived from the sorted member dedup_hash:dedup_sequence pairs, so a re-sync
  -- over an overlapping window re-derives the same key and the UNIQUE below
  -- turns a rejected event into a permanent tombstone (no re-suggestion).
  event_key     TEXT NOT NULL,

  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (workspace_id, event_key)
);

CREATE INDEX idx_events_workspace_status ON financial_events(workspace_id, status);
CREATE INDEX idx_events_workspace_type   ON financial_events(workspace_id, event_type);
CREATE INDEX idx_events_canonical        ON financial_events(canonical_transaction_id);

-- 2. Membership: a transaction <-> event link carrying a role. A TABLE (not a
--    column) because one card purchase can be its own expense AND a member of a
--    credit_card_statement at the same time. Inline FKs are legal on this fresh
--    table.
CREATE TABLE event_members (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id   INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id       INTEGER NOT NULL REFERENCES financial_events(id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,

  role           TEXT NOT NULL CHECK (role IN (
                   'debit',         -- money leaving an account
                   'credit',        -- money arriving in an account
                   'bill_payment',  -- the bank debit that settles a card statement
                   'purchase',      -- an individual card purchase a statement settles (keeps kind='expense')
                   'fee',           -- an associated fee leg
                   'reversal')),    -- a credit reversing an earlier purchase

  -- The kind this leg held before the event excluded it, for lossless undo.
  -- NULL means the event did not change this leg's kind (e.g. a 'purchase').
  prior_kind     TEXT CHECK (prior_kind IS NULL OR prior_kind IN ('expense','income','transfer')),

  -- Per-leg score, distinct from the event-level confidence.
  match_confidence REAL
                   CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),

  created_at     TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (workspace_id, transaction_id, event_id)
);

CREATE INDEX idx_members_event ON event_members(event_id);
CREATE INDEX idx_members_txn   ON event_members(workspace_id, transaction_id);

-- A transaction may be at most ONE *grouping* leg (the leg whose kind the event
-- flips). 'purchase' is the deliberate exception so a card purchase can link to
-- its statement without losing its own kind='expense' projection.
CREATE UNIQUE INDEX idx_members_one_grouping_leg
  ON event_members(workspace_id, transaction_id)
  WHERE role != 'purchase';

-- 3. Denormalized primary-event pointer on transactions. No inline REFERENCES:
--    SQLite rejects a FK on ADD COLUMN. Integrity is enforced in app code, and
--    the reject path nulls event_id before tombstoning the event. Mirrors the
--    GROUPING membership only (never a 'purchase' link), so a purchase's
--    event_id stays NULL and it remains spendable.
ALTER TABLE transactions ADD COLUMN event_id INTEGER;

ALTER TABLE transactions ADD COLUMN event_role TEXT
  CHECK (event_role IS NULL OR event_role IN
    ('debit','credit','bill_payment','purchase','fee','reversal'));

ALTER TABLE transactions ADD COLUMN match_confidence REAL
  CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1));

-- Partial index keeps the analytics hot path untouched: on a fresh install
-- almost no rows have an event.
CREATE INDEX idx_transactions_event
  ON transactions(event_id)
  WHERE event_id IS NOT NULL;

-- 4. Blocking support for candidate generation. SQLite cannot add a STORED
--    generated column via ALTER TABLE, so we use an expression index instead.
--    ROUND and ABS are deterministic, so a query that filters on the same
--    ROUND(ABS(charged_amount), 2) expression can use this b-tree for an
--    equality probe, keeping pairing off the O(n^2) path.
CREATE INDEX idx_transactions_block
  ON transactions(workspace_id, charged_currency, ROUND(ABS(charged_amount), 2), date);

-- 5. Per-event-type matcher thresholds, tunable without a code edit
--    (open-source priority: users self-host and customize).
CREATE TABLE match_settings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id    INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL CHECK (event_type IN (
                    'internal_transfer','credit_card_payment','credit_card_statement',
                    'atm_withdrawal','loan_repayment','investment_transfer',
                    'refund_reversal','fee','duplicate')),
  -- Max allowed |abs(a) - abs(b)|. Matches DEFAULT_EPSILON = 0.01.
  epsilon         REAL    NOT NULL DEFAULT 0.01,
  -- Max date gap in days. Matches DEFAULT_DAY_WINDOW = 2.
  day_window      INTEGER NOT NULL DEFAULT 2,
  -- Suggest in [min_score, auto_score); auto-confirm at or above auto_score.
  min_score       REAL    NOT NULL DEFAULT 0.80,
  auto_score      REAL    NOT NULL DEFAULT 0.97,
  -- Require a description keyword on at least one side.
  require_keyword INTEGER NOT NULL DEFAULT 1,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, event_type)
);

-- Seed defaults per EXISTING workspace so behavior is unchanged on upgrade. New
-- workspaces fall back to hard-coded defaults in the query layer.
INSERT INTO match_settings (workspace_id, event_type, epsilon, day_window, min_score, auto_score, require_keyword)
SELECT w.id, et.event_type, et.epsilon, et.day_window, et.min_score, et.auto_score, et.require_keyword
FROM workspaces w
CROSS JOIN (
  SELECT 'internal_transfer'     AS event_type, 0.01 AS epsilon, 2  AS day_window, 0.80 AS min_score, 0.97 AS auto_score, 1 AS require_keyword
  UNION ALL SELECT 'credit_card_payment',   0.01, 5,  0.80, 0.97, 1
  UNION ALL SELECT 'credit_card_statement', 1.00, 38, 0.80, 0.97, 0
  UNION ALL SELECT 'atm_withdrawal',        0.01, 2,  0.80, 0.97, 1
  UNION ALL SELECT 'loan_repayment',        0.01, 5,  0.80, 0.97, 1
  UNION ALL SELECT 'investment_transfer',   0.01, 5,  0.80, 0.97, 1
  UNION ALL SELECT 'refund_reversal',       0.01, 90, 0.80, 0.97, 0
  UNION ALL SELECT 'fee',                   0.01, 2,  0.80, 0.97, 0
  UNION ALL SELECT 'duplicate',             0.00, 10, 0.80, 0.97, 0
) et;

-- 6. User pattern overrides (sticky corrections). Matched against the RAW
--    description (the stable bank original).
CREATE TABLE match_rules (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id        INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  description_pattern TEXT,                 -- substring or /regex/ against raw description
  provider            TEXT,
  amount_min          REAL,                 -- on ABS(charged_amount)
  amount_max          REAL,                 -- on ABS(charged_amount)
  set_kind            TEXT CHECK (set_kind IS NULL OR set_kind IN ('expense','income','transfer')),
  set_event_type      TEXT CHECK (set_event_type IS NULL OR set_event_type IN (
                        'internal_transfer','credit_card_payment','credit_card_statement',
                        'atm_withdrawal','loan_repayment','investment_transfer','fee')),
  set_category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  hide                INTEGER NOT NULL DEFAULT 0,   -- maps to transactions.is_excluded
  priority            INTEGER NOT NULL DEFAULT 100, -- lower runs first
  enabled             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_rules_workspace ON match_rules(workspace_id, enabled, priority);

-- 7. The canonical "what counts as spend exactly once" projection. A row is
--    spendable when it is a completed expense that is EITHER unattached to any
--    grouping event OR the canonical row of its event. Because every event this
--    layer creates has canonical_transaction_id = NULL, a grouped row is never
--    spendable, and a row with no event (event_id IS NULL) stays counted: zero
--    reporting drift on upgrade. Analytics keep filtering on `kind` today; this
--    view is the forward path once canonical-based spend dedup is enabled.
CREATE VIEW spendable_transactions AS
SELECT t.*
FROM transactions t
WHERE t.status = 'completed'
  AND t.kind = 'expense'
  AND (
        t.event_id IS NULL
     OR t.id = (SELECT fe.canonical_transaction_id
                FROM financial_events fe
                WHERE fe.id = t.event_id)
  );
