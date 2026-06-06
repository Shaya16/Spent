# Transaction Deduplication via Financial Events: Design for Spent

## Summary

The same real-world money event (an ATM withdrawal, a credit-card bill payment, an
internal transfer, a loan or investment payment) shows up as two or more rows once you
aggregate multiple accounts. Today Spent flattens this with a single `kind` flag
(`expense` / `income` / `transfer`) set by keyword rules in `detectKind`
(`src/server/lib/transfers.ts`) and a greedy 1:1 pairer in `findInternalTransferPairs`
(`src/server/lib/internal-transfers.ts`). That keeps transfers out of spend, but the
relationship between the rows is invisible, unauditable, has no confidence score, no
review/undo, and no link between a credit-card bill and the purchases that compose it.

This design adds a first-class **Financial Event** layer above the existing
`transactions` table. A Financial Event groups the N rows that represent one real-world
event, records its type, a chosen **canonical transaction** for reporting, a confidence
score, and human-readable match reasons. It keeps the existing exact dedup
(`dedup_hash` / `dedup_sequence`) and the `kind` column intact and backward compatible,
generalizing the current keyword-flipping into a transparent, tunable matching engine.

Core principles that run through every section:

- **Two layers, kept separate.** Layer 1 is intra-account exact dedup (already shipped,
  unchanged). Layer 2 is the new cross-account event grouping.
- **Group, never delete.** Rows are preserved; an event points at them and picks one
  canonical row for reporting. Everything is reversible.
- **Count each expense exactly once.** Reporting reads a single "spendable" projection
  so transfers, CC bill payments, and the bill-vs-purchases double count are excluded
  once and only once.
- **Never silently hide real money.** Auto-merge requires a hard anchor (opposite-sign,
  equal-amount, cross-account). Fuzzy description similarity can refine or suggest but
  can never, on its own, flip a real expense to a transfer. When uncertain, suggest for
  review instead of auto-hiding.

This document was produced by a multi-agent research + design + adversarial-review
workflow. Each section below was independently drafted and then adversarially verified
against the real codebase.

## Table of Contents

0. [Unified Data Model (Authoritative)](#unified-data-model-authoritative) (read first; governs all naming)
1. [Recommended Domain Model](#recommended-domain-model)
2. [Deduplication Architecture](#deduplication-architecture)
3. [Matching Algorithms and Confidence Scoring](#matching-algorithms-and-confidence-scoring)
4. [Database Schema Suggestions (SQLite)](#database-schema-suggestions-sqlite)
5. [Edge Cases and Failure Scenarios](#edge-cases-and-failure-scenarios)
6. [UX Recommendations for Merged Transactions](#ux-recommendations-for-merged-transactions)
7. [Scalable Implementation Strategy](#scalable-implementation-strategy)
8. [Appendix: Industry Practices](#appendix-industry-practices)


---

## Unified Data Model (Authoritative)

This section is the single source of truth for the event-grouping data model. Wherever the detailed sections below (Domain Model, Database Schema, Deduplication Architecture, Matching Algorithms) use a different table name, column name, role, enum value, or structure, the names and structures defined here win and those sections should be read with the substitutions in the Naming normalization map at the end. The design layers a first-class "financial event" object over the existing `transactions` table without touching the `kind` column, the exact `dedup_hash` / `dedup_sequence` dedup, or any reporting query; on upgrade day it produces byte-for-byte identical totals.

### Decisions

| Concern | Decision | Rationale |
|---|---|---|
| 1. Membership table name | `event_members` | It is the spelling used by two of four sections (Architecture, Matching) and reads naturally as "members of an event"; `event_memberships`, `financial_event_members`, and `event_transactions` are rejected as longer or less used variants. |
| 2. Membership table vs columns on `transactions` | A `event_members` TABLE plus a denormalized `transactions.event_id` pointer for the single "primary" event | A single `transactions.event_id` column cannot represent the N:1 case where one card purchase is both its own expense and a linked member of a bill, so a table is required; the denormalized pointer is kept only as a fast filter for the hot analytics path and the candidate query. |
| 3. Canonical column name | `canonical_transaction_id` | The user requirement language says "Canonical transaction chosen for reporting"; the events DDL and the `spendable_transactions` view both use this exact name, so the view's correlated subquery resolves. |
| 4. Role vocabulary | Simple set: `debit`, `credit`, `bill_payment`, `purchase`, `fee`, `reversal` | A short, unambiguous set keyed to the leg's function; the rich set is mapped onto it (`source_debit`->`debit`, `dest_credit`->`credit`, `underlying_purchase`->`purchase`, `fee_leg`->`fee`, `reversal_of`->`reversal`, `canonical` is dropped as a role because canonicity lives on the event, not the member). |
| 5. event_type enum | `internal_transfer`, `credit_card_payment` (1:1 bank-debit <-> card-credit), `credit_card_statement` (N:1 one bill <-> N purchases), `atm_withdrawal`, `loan_repayment`, `investment_transfer`, `refund_reversal`, `fee`, `duplicate` | The 1:1 leg-pair and the N:1 bill-to-purchases link are genuinely different cardinalities with different projection rules, so they are two distinct types (`credit_card_payment` vs `credit_card_statement`), not one; `cc_statement` / `cc_bill_payment` are folded into these two clear names. |
| 6. `match_rules` name collision | Split into `match_settings` (per-event-type thresholds: epsilon, day_window, min_score, auto_score, require_keyword) and `match_rules` (user pattern overrides: description_pattern, set_kind, set_event_type, hide, priority) | They are two unrelated concerns (tuning the matcher vs forcing a classification), so they get two tables; "thresholds" become `match_settings` and the user override engine keeps the `match_rules` name. |
| 7. FK from event tables to `transactions(id)` | Tables freshly created in this migration (`financial_events.canonical_transaction_id`, `event_members.transaction_id`) DO declare inline FKs with `ON DELETE` actions; the column added to the existing `transactions` table (`event_id`) does NOT, because SQLite rejects `ALTER TABLE ADD COLUMN ... REFERENCES`. | Inline FKs are legal and desirable on new tables and pass `foreign_key_check`; the one column on the pre-existing table cannot carry an inline FK without a full table recreate, so its integrity is enforced in app code. |
| 8. Provenance fields | Keep `prior_kind` on `event_members` (lossless undo) and `confidence` + `reasons` (JSON) on `financial_events`; unify `source` to `heuristic`, `rule`, `user`, `ai` (the `auto` value maps to `heuristic`) | The richer source set distinguishes which automatic mechanism fired (matcher heuristic vs a saved `match_rules` override vs an LLM suggestion), which the review UI needs; `auto` collapses to `heuristic`. |

### Canonical SQLite DDL

The migration sorts strictly after `021_reclassify_credit_card_transfers.sql` (migrations are applied in lexicographic filename order, and `020_*` / `021_*` duplicate prefixes already exist). Name it `022_financial_events.sql`. Row-pairing backfill stays in idempotent TypeScript so the runner's closing `foreign_key_check` cannot trip on a dangling reference; only DDL and workspace-scoped seeds live in the SQL.

```sql
-- 022_financial_events.sql
-- First-class, auditable, reversible event-grouping layer over transactions.
-- Additive only: no table dropped, no column removed, no type changed. The kind
-- column and the dedup_hash / dedup_sequence dedup are left intact and stay the
-- analytics source of truth. Pair-reconstruction runs in TypeScript
-- (src/server/db/backfill/022_events.ts), not here, so the runner's closing
-- foreign_key_check never sees a half-written reference.

-- 1. The event: one real-world money movement composed of N transaction rows.
CREATE TABLE financial_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  event_type    TEXT NOT NULL CHECK (event_type IN (
                  'internal_transfer',      -- account A debit <-> account B credit (1:1)
                  'credit_card_payment',    -- bank debit <-> card-side credit (1:1 legs)
                  'credit_card_statement',  -- one bank bill <-> N card purchases (N:1)
                  'atm_withdrawal',         -- cash leaving a tracked account (single leg)
                  'loan_repayment',         -- checking -> loan account
                  'investment_transfer',    -- checking -> brokerage account
                  'refund_reversal',        -- a credit reversing an earlier purchase
                  'fee',                    -- a standalone or attached fee row
                  'duplicate')),            -- pending<->posted or re-pull artifact, linked not collapsed

  -- The one member projected by per-event reporting, or NULL when the event
  -- contributes nothing to spend. NULL for internal_transfer, credit_card_payment,
  -- credit_card_statement, refund_reversal, and duplicate (none are spend). The
  -- name is canonical_transaction_id everywhere, including the spendable view.
  canonical_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,

  status        TEXT NOT NULL DEFAULT 'suggested'
                  CHECK (status IN ('suggested','confirmed','rejected')),

  -- Provenance: heuristic = the matcher, rule = a match_rules override fired,
  -- user = a manual action, ai = an LLM suggestion. 'auto' from the schema
  -- section maps to 'heuristic'.
  source        TEXT NOT NULL DEFAULT 'heuristic'
                  CHECK (source IN ('heuristic','rule','user','ai')),

  -- Fellegi-Sunter P(match) in [0,1]. A score, not money, so REAL is correct.
  confidence    REAL NOT NULL DEFAULT 1.0
                  CHECK (confidence >= 0 AND confidence <= 1),

  -- JSON array of human-readable reasons plus the comparison vector. JSON1 is
  -- compiled into better-sqlite3's bundled SQLite, so json_valid works.
  reasons       TEXT CHECK (reasons IS NULL OR json_valid(reasons)),

  -- Idempotency key, the events-layer analogue of UNIQUE(dedup_hash,dedup_sequence).
  -- Derived from the sorted member (dedup_hash:dedup_sequence) pairs, NOT from
  -- row ids (ids are not stable across a re-pull, dedup_hash is). A re-sync over
  -- an overlapping window re-derives the same key and upserts in place.
  event_key     TEXT NOT NULL,

  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (workspace_id, event_key)
);

CREATE INDEX idx_events_workspace_status ON financial_events(workspace_id, status);
CREATE INDEX idx_events_workspace_type   ON financial_events(workspace_id, event_type);
CREATE INDEX idx_events_canonical        ON financial_events(canonical_transaction_id);
-- Review queue: open, auto-detected, low confidence first.
CREATE INDEX idx_events_review
  ON financial_events(workspace_id, status, confidence)
  WHERE status = 'suggested' AND source = 'heuristic';

-- 2. Membership: a transaction <-> event link carrying a role. This is a TABLE,
--    not a column, because one card purchase can be its own expense AND a member
--    of a credit_card_statement event at the same time. Inline FKs are legal
--    here because the table is freshly created.
CREATE TABLE event_members (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id   INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id       INTEGER NOT NULL REFERENCES financial_events(id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,

  role           TEXT NOT NULL CHECK (role IN (
                   'debit',         -- money leaving an account (was source_debit / outflow / transfer_out)
                   'credit',        -- money arriving in an account (was dest_credit / inflow / transfer_in)
                   'bill_payment',  -- the single bank debit that settles a card statement
                   'purchase',      -- an individual card purchase the statement settles (was underlying_purchase / bill_item)
                   'fee',           -- an associated fee leg (FX fee, ATM fee) (was fee_leg)
                   'reversal')),    -- a credit reversing an earlier purchase (was reversal_of)

  -- The kind this leg held before the event excluded it, for lossless undo.
  -- NULL means the event did NOT change this leg (a 'purchase' leg in a
  -- credit_card_statement keeps kind='expense', so its prior_kind is NULL).
  prior_kind     TEXT CHECK (prior_kind IS NULL OR prior_kind IN ('expense','income','transfer')),

  -- Per-leg score, distinct from the event-level confidence, so one weak leg can
  -- be flagged while the event as a whole is confirmed.
  match_confidence REAL
                   CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),

  created_at     TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (workspace_id, transaction_id, event_id)
);

CREATE INDEX idx_members_event ON event_members(event_id);
CREATE INDEX idx_members_txn   ON event_members(workspace_id, transaction_id);

-- A transaction may be at most ONE *grouping* leg (the leg that determines its
-- kind). 'purchase' is the deliberate exception so a card purchase can be linked
-- to its statement WITHOUT losing its own kind='expense' projection. This is the
-- partial unique index that resolves contradiction 2.
CREATE UNIQUE INDEX idx_members_one_grouping_leg
  ON event_members(workspace_id, transaction_id)
  WHERE role != 'purchase';

-- 3. Denormalized primary-event pointer on transactions. No inline REFERENCES:
--    SQLite rejects FK on ADD COLUMN. Integrity is enforced in app code, and the
--    unmerge path nulls event_id on members before deleting an event. It mirrors
--    the GROUPING membership only (never a 'purchase' link), so a purchase's
--    event_id stays NULL and it remains spendable.
ALTER TABLE transactions ADD COLUMN event_id INTEGER;

ALTER TABLE transactions ADD COLUMN event_role TEXT
  CHECK (event_role IS NULL OR event_role IN
    ('debit','credit','bill_payment','purchase','fee','reversal'));

ALTER TABLE transactions ADD COLUMN match_confidence REAL
  CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1));

-- Partial index keeps the analytics hot path untouched: on a fresh install almost
-- no rows have an event.
CREATE INDEX idx_transactions_event
  ON transactions(event_id)
  WHERE event_id IS NOT NULL;

-- 4. BLOCKING SUPPORT for candidate generation. SQLite cannot index a bare
--    expression like ABS(charged_amount) referenced from a join unless that exact
--    expression is the index key, so we materialize a generated column and index
--    THAT. STORED so the blocking index is a plain b-tree the planner uses for an
--    equality probe; abs/round are deterministic, which STORED generated columns
--    require. charged_currency is included so a 100 USD debit never blocks with a
--    100 ILS credit.
ALTER TABLE transactions
  ADD COLUMN charged_abs_amount REAL
  GENERATED ALWAYS AS (ROUND(ABS(charged_amount), 2)) STORED;

CREATE INDEX idx_transactions_block
  ON transactions(workspace_id, charged_currency, charged_abs_amount, date);

-- 5. Per-event-type matcher thresholds (tunable without a code edit).
CREATE TABLE match_settings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN (
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

-- Seed defaults per EXISTING workspace so behavior is unchanged on upgrade.
-- New workspaces created after this migration must read with a hard-coded
-- fallback so detection is never silently disabled.
INSERT INTO match_settings (workspace_id, event_type, epsilon, day_window, min_score, auto_score, require_keyword)
SELECT w.id, et.event_type, et.epsilon, et.day_window, et.min_score, et.auto_score, et.require_keyword
FROM workspaces w
CROSS JOIN (
  SELECT 'internal_transfer'     AS event_type, 0.01 AS epsilon, 2  AS day_window, 0.80 AS min_score, 0.97 AS auto_score, 1 AS require_keyword
  UNION ALL SELECT 'credit_card_payment',   0.01, 5,  0.80, 0.97, 0
  UNION ALL SELECT 'credit_card_statement', 1.00, 38, 0.80, 0.97, 0
  UNION ALL SELECT 'atm_withdrawal',        0.01, 2,  0.80, 0.97, 1
  UNION ALL SELECT 'loan_repayment',        0.01, 5,  0.80, 0.97, 1
  UNION ALL SELECT 'investment_transfer',   0.01, 5,  0.80, 0.97, 1
  UNION ALL SELECT 'refund_reversal',       0.01, 90, 0.80, 0.97, 0
  UNION ALL SELECT 'fee',                   0.01, 2,  0.80, 0.97, 0
  UNION ALL SELECT 'duplicate',             0.00, 10, 0.80, 0.97, 0
) et;

-- 6. User pattern overrides (sticky corrections). Matched against the RAW
--    description (the stable bank original), not a cleaned merchant name.
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
  hide                INTEGER NOT NULL DEFAULT 0,   -- maps to transactions.is_excluded (migration 020)
  priority            INTEGER NOT NULL DEFAULT 100, -- lower runs first
  enabled             INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_rules_workspace ON match_rules(workspace_id, enabled, priority);

-- 7. The canonical "what counts as spend exactly once" definition. A row is
--    spendable when it is a completed expense that is EITHER unattached to any
--    grouping event OR is the canonical row of its event. Because the day-one
--    backfill leaves every event with canonical_transaction_id = NULL, the
--    t.id = (NULL) branch is never true, so every currently-excluded leg stays
--    excluded and every currently-counted expense (event_id IS NULL) stays
--    counted: zero reporting drift on upgrade. Uses the canonical column name.
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
```

The day-window slack still must be applied in application code (`julianday` arithmetic), and the blocking probe must scan the row's own amount bucket plus its neighbors before applying the precise `ABS(ABS(a) - ABS(b)) <= epsilon` test, because rounding is a hard bucket boundary. The generated `charged_abs_amount` column makes each bucket probe an O(log n) point lookup rather than a scan, which is what keeps detection off the O(n^2) path.

### Canonical TypeScript types and enums

```typescript
// src/lib/types.ts (additive)

export type EventType =
  | "internal_transfer"
  | "credit_card_payment"     // 1:1 bank debit <-> card-side credit
  | "credit_card_statement"   // N:1 one bill <-> N purchases
  | "atm_withdrawal"
  | "loan_repayment"
  | "investment_transfer"
  | "refund_reversal"
  | "fee"
  | "duplicate";

export type EventRole =
  | "debit"          // money leaving an account
  | "credit"         // money arriving in an account
  | "bill_payment"   // the single bank debit that settles a card statement
  | "purchase"       // an individual card purchase a statement settles (additive, keeps kind='expense')
  | "fee"            // an associated fee leg
  | "reversal";      // a credit reversing an earlier purchase

export type EventStatus = "suggested" | "confirmed" | "rejected";

export type EventSource = "heuristic" | "rule" | "user" | "ai";

export type TransactionKind = "expense" | "income" | "transfer";

export interface FinancialEvent {
  id: number;
  workspaceId: number;
  eventType: EventType;
  canonicalTransactionId: number | null;
  status: EventStatus;
  source: EventSource;
  confidence: number;
  reasons: string[] | null;
  eventKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventMember {
  id: number;
  workspaceId: number;
  eventId: number;
  transactionId: number;
  role: EventRole;
  priorKind: TransactionKind | null;
  matchConfidence: number | null;
  createdAt: string;
}

export interface MatchSettings {
  id: number;
  workspaceId: number;
  eventType: EventType;
  epsilon: number;
  dayWindow: number;
  minScore: number;
  autoScore: number;
  requireKeyword: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatchRule {
  id: number;
  workspaceId: number;
  descriptionPattern: string | null;
  provider: string | null;
  amountMin: number | null;
  amountMax: number | null;
  setKind: TransactionKind | null;
  setEventType: Exclude<EventType, "refund_reversal" | "duplicate"> | null;
  setCategoryId: number | null;
  hide: boolean;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Naming normalization map

| Variant used in a section below | Canonical name |
|---|---|
| `event_memberships`, `financial_event_members`, `event_transactions` (table) | `event_members` |
| `representative_txn_id`, `canonical_txn_id` (column) | `canonical_transaction_id` |
| `match_reasons`, `reasons_json` (column) | `reasons` |
| `state` (on the event) | `status` |
| `match_rules` used for thresholds (epsilon/day_window/min_score/auto_score/require_keyword) | `match_settings` |
| `match_rules` used for user pattern overrides | `match_rules` (unchanged) |
| role `source_debit`, `outflow`, `transfer_out` | role `debit` |
| role `dest_credit`, `inflow`, `transfer_in` | role `credit` |
| role `underlying_purchase`, `bill_item` | role `purchase` |
| role `fee_leg` | role `fee` |
| role `reversal_of` | role `reversal` |
| role `bill` (cc_statement member) | role `bill_payment` |
| role `canonical` (as a member role) | dropped; canonicity lives on `financial_events.canonical_transaction_id` |
| event_type `cc_statement`, `cc_bill_payment` (N:1) | `credit_card_statement` |
| event_type `credit_card_payment` (1:1 leg pair) | `credit_card_payment` (unchanged) |
| `source` value `auto` | `heuristic` |
| `transactions.match_amount_cents`, `norm_description` (matcher scratch columns) | not in this authoritative core; blocking uses the generated `charged_abs_amount` column |
| `match_candidates` (staging table) | retained as the sections define it; orthogonal to this core model |
| migration file `022_event_matching.sql` | `022_financial_events.sql` |

---

## Recommended Domain Model

This section introduces a first-class **Financial Event** layer that sits *above* the existing `transactions` table. It does not replace `kind`, the existing exact dedup (`dedup_hash` / `dedup_sequence`), or any reporting query. It generalizes the ad-hoc `kind`-flipping done today in `detectKind` (`src/server/lib/transfers.ts`) and `findInternalTransferPairs` (`src/server/lib/internal-transfers.ts`) into an auditable, reversible grouping with persisted scores and reasons.

The guiding principle, taken from how Monarch, Copilot, YNAB and Simplifi all ship: **count each real-world spend exactly once, at purchase time, and never on the settling money-movement.** Where those products achieve this purely by tagging each leg with an excluded category, Spent keeps that per-leg signal (the `kind` column) *and* adds the explicit grouping object the aggregators lack, so the relationship between a credit-card bill and its underlying purchases is visible, auditable, and undoable.

### 0. Constraints this design must respect (verified against the codebase)

These are load-bearing facts that shaped every decision below.

- **Migrations are ordered lexicographically by full filename and tracked by filename**, not by an integer counter. `migrate.ts` does `readdirSync(...).filter(.sql).sort()` and records each applied file in `_migrations(name)`. The tree already contains *duplicate numeric prefixes* (`020_excluded.sql` + `020_multiple_bank_credentials.sql`, `021_chat_sessions.sql` + `021_reclassify_credit_card_transfers.sql`). The current lexicographic tail is `021_reclassify_credit_card_transfers.sql`. The new file must sort strictly after it; use a descriptive, unambiguous name: **`022_financial_events.sql`**. Do not rely on "the counter is 021"; rely on the sort.
- **`detectKind` is NOT a general bank classifier.** `isBankProvider` only returns true for `hapoalim` and `leumi` (`BANK_PROVIDERS_SET`). Every other provider (`mizrahi`, `discount`, `oneZero`, all card providers) falls through to the `expense` branch at insert time. So today's insert-time CC-payment and income detection only fires for two banks. The event layer must therefore treat `detectKind` as a *partial, two-bank* first pass and do the heavier lifting in the post-insert grouping pass, which is provider-agnostic.
- **`is_excluded` already exists** on `transactions` (migration `020_excluded.sql`), as does the `excluded_merchants` table, and `mapTransactionRow` already reads `is_excluded`. The new `match_rules.hide` action maps onto that column. No new exclusion column is introduced.
- **`bank_credentials` already carries `label` (plaintext, <=128 chars) and `requires_manual_two_factor`** (migrations `020_multiple_bank_credentials.sql`, `019_two_factor.sql`). The `accounts.label` falls back to `bank_credentials.label`.
- **Pairing today is O(debits x credits) inside the sync window** (`findInternalTransferPairs` nested loop). Generalizing it without bucketing would reproduce that quadratic. The scorer below buckets candidates by `(currency, ROUND(ABS(charged_amount),2))` first, so comparison is near-linear in practice.
- **`ALTER TABLE ... ADD COLUMN <fk> REFERENCES ...` is rejected by SQLite.** That is exactly why migration 013 recreated tables. So `transactions.account_id` cannot be added with an inline `REFERENCES` clause; it is added as a plain `INTEGER` column and the relationship is enforced in application code (better-sqlite3 has `foreign_keys` ON, and an inline FK on ADD COLUMN would throw). The `accounts` table itself can declare its FKs normally because it is freshly created.

### Entities at a glance

```
Account            (NEW)  one row per real-world account behind transactions
Transaction        (EXISTING)  unchanged columns; one new nullable account_id (no inline FK)
FinancialEvent     (NEW)  a logical money-movement grouping N transactions
EventMembership    (NEW)  transaction <-> event link, carries a role
MatchCandidate     (NEW)  a proposed (not yet confirmed) grouping + score + reasons
MatchRule          (NEW)  a persisted user/heuristic rule that classifies or groups
```

A row's `kind` answers *"how does this single row score in spend/income analytics?"*; a `FinancialEvent` answers *"what real-world thing happened, and which rows are its legs?"*. A transfer / CC-payment / ATM move becomes an event whose canonical projection is excluded from spend. A plain expense or income row needs no event at all (see roles below).

### 1. Account

Today an account is implicit: the tuple `(workspace_id, provider, account_number)`, optionally narrowed by `credential_id`. We materialize it so events can reference stable account identities, and so an `AccountType` can drive type-specific event rules (a debit on a `credit_card` account behaves differently from one on `checking`). Stable account identity also defends against credential re-link churn (the largest documented duplicate source in Copilot/Quicken).

```sql
-- 022_financial_events.sql (additive)
PRAGMA foreign_keys = OFF; -- migrate.ts already toggles this; left here for clarity

CREATE TABLE accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id   INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  credential_id  INTEGER REFERENCES bank_credentials(id) ON DELETE SET NULL,
  provider       TEXT NOT NULL,
  account_number TEXT NOT NULL,
  -- checking|credit_card|loan|brokerage|wallet|cash|unknown
  type           TEXT NOT NULL DEFAULT 'unknown'
                  CHECK(type IN ('checking','credit_card','loan','brokerage','wallet','cash','unknown')),
  label          TEXT,           -- display name; UI falls back to bank_credentials.label
  currency       TEXT,           -- dominant charged_currency, informational only
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  -- stable identity within a workspace; keyed on (provider, account_number),
  -- NOT the rotating credential id, so it survives credential re-link.
  UNIQUE(workspace_id, provider, account_number)
);
CREATE INDEX idx_accounts_workspace ON accounts(workspace_id);

-- No inline REFERENCES: SQLite rejects FK on ADD COLUMN. The link is enforced
-- in application code; account_id is nullable so the migration cannot fail and
-- legacy rows degrade gracefully.
ALTER TABLE transactions ADD COLUMN account_id INTEGER;
CREATE INDEX idx_transactions_account ON transactions(account_id);

-- Backfill one accounts row per distinct (workspace_id, provider, account_number),
-- seeding type from the provider's BankKind in BANK_PROVIDERS (card -> credit_card,
-- bank -> checking). oneZero and per-account overrides are applied by the app later.
INSERT INTO accounts (workspace_id, provider, account_number, credential_id, type)
SELECT t.workspace_id, t.provider, t.account_number,
       (SELECT bc.id FROM bank_credentials bc
         WHERE bc.workspace_id = t.workspace_id AND bc.provider = t.provider
         LIMIT 1),
       'unknown'  -- refined to checking/credit_card by a one-time app backfill from BANK_PROVIDERS
FROM (SELECT DISTINCT workspace_id, provider, account_number FROM transactions) t;

UPDATE transactions
SET account_id = (
  SELECT a.id FROM accounts a
  WHERE a.workspace_id = transactions.workspace_id
    AND a.provider = transactions.provider
    AND a.account_number = transactions.account_number
);
```

The `type` seed is left `'unknown'` in pure SQL because `BANK_PROVIDERS` lives in TypeScript (`src/lib/types.ts`), not SQL; a one-time app-level backfill maps each provider's `BankKind` to `checking`/`credit_card`. Pairing falls back to the existing `credential_id`/`account_number` logic in `isDifferentAccount` whenever `account_id` is null, so the absence of accounts never breaks matching.

```typescript
export type AccountType =
  | "checking" | "credit_card" | "loan"
  | "brokerage" | "wallet" | "cash" | "unknown";

export interface Account {
  id: number;
  workspaceId: number;
  credentialId: number | null;
  provider: string;
  accountNumber: string;
  type: AccountType;
  label: string | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 2. FinancialEvent, EventMembership, and roles

```sql
CREATE TABLE financial_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK(type IN (
                   'internal_transfer','credit_card_payment','atm_withdrawal',
                   'loan_repayment','investment_transfer','refund_reversal','fee')),
  -- member transaction used for any per-event projection (a "transfers" report,
  -- a fee row). NULL for money-movement events that must never be summed.
  -- No inline FK to transactions on this column is needed because the table is
  -- new; it is declared inline and valid.
  canonical_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  -- Fellegi-Sunter P(match) in [0,1].
  confidence    REAL NOT NULL DEFAULT 1.0 CHECK(confidence >= 0 AND confidence <= 1),
  -- 'heuristic' (transfers.ts logic), 'rule' (MatchRule), 'user' (manual),
  -- 'ai' (LLM-suggested). Mirrors transactions.category_source semantics.
  source        TEXT NOT NULL CHECK(source IN ('heuristic','rule','user','ai')),
  -- 'confirmed' once auto-applied/accepted; 'suggested' awaiting review;
  -- 'rejected' tombstone kept for audit + to suppress re-suggestion.
  state         TEXT NOT NULL DEFAULT 'confirmed'
                  CHECK(state IN ('suggested','confirmed','rejected')),
  reasons       TEXT,           -- JSON array of human-readable reasons
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_workspace ON financial_events(workspace_id);
CREATE INDEX idx_events_type ON financial_events(workspace_id, type);
CREATE INDEX idx_events_canonical ON financial_events(canonical_transaction_id);

CREATE TABLE event_memberships (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id   INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_id       INTEGER NOT NULL REFERENCES financial_events(id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK(role IN (
                   'source_debit','dest_credit','bill_payment',
                   'underlying_purchase','fee_leg','reversal_of','canonical')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  -- A transaction belongs to at most ONE GROUPING event (transfer/cc-payment/
  -- loan/investment/refund). See the membership-uniqueness note below for why
  -- 'underlying_purchase' is the deliberate exception, handled by a partial
  -- unique index rather than a column-level UNIQUE.
  UNIQUE(workspace_id, transaction_id, event_id)
);
CREATE INDEX idx_memberships_event ON event_memberships(event_id);
CREATE INDEX idx_memberships_txn ON event_memberships(workspace_id, transaction_id);

-- A transaction may participate as at most ONE *grouping* leg (the legs that
-- determine its kind). 'underlying_purchase' is excluded so a card purchase can
-- be audited as part of a credit_card_payment event WITHOUT losing its own
-- kind='expense' projection. This is the fix for the over-clustering concern and
-- for the "a purchase is both its own expense and a member of the bill" tension.
CREATE UNIQUE INDEX idx_memberships_one_grouping_leg
  ON event_memberships(workspace_id, transaction_id)
  WHERE role != 'underlying_purchase';
```

Why the membership rule changed from a blanket `UNIQUE(workspace_id, transaction_id)`: the draft's blanket constraint is self-contradictory for credit-card payments. A card purchase must (a) keep `kind='expense'` and count in spend, and (b) be attachable to the `credit_card_payment` event for auditing. Under a blanket unique constraint it could be a member of *either* its own event *or* the bill, never linked to the bill without losing its expense projection. The partial unique index resolves this: exactly one *grouping* leg per transaction (so transfers cannot chain or double-assign), but `underlying_purchase` links are additive annotations that never touch the purchase's `kind`. There is no separate `actual_expense`/`actual_income` event type at all; a plain expense is just `kind='expense'` with zero memberships. This removes a whole class of "degenerate event" rows and the over-clustering risk the entity-resolution literature warns about.

```typescript
export type EventType =
  | "internal_transfer" | "credit_card_payment" | "atm_withdrawal"
  | "loan_repayment" | "investment_transfer" | "refund_reversal" | "fee";

export type EventRole =
  | "source_debit"         // money leaving an account (e.g. checking -X)
  | "dest_credit"          // money arriving in an account (e.g. card +X)
  | "bill_payment"         // the single bank debit that pays a CC statement
  | "underlying_purchase"  // an individual card purchase the bill settles (additive)
  | "fee_leg"              // an associated fee row (FX fee, ATM fee)
  | "reversal_of"          // a credit that reverses an earlier debit
  | "canonical";           // the member a per-event report projects

export type EventSource = "heuristic" | "rule" | "user" | "ai";
export type EventState = "suggested" | "confirmed" | "rejected";

export interface FinancialEvent {
  id: number;
  workspaceId: number;
  type: EventType;
  canonicalTransactionId: number | null;
  confidence: number;
  source: EventSource;
  state: EventState;
  reasons: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventMembership {
  id: number;
  workspaceId: number;
  eventId: number;
  transactionId: number;
  role: EventRole;
  createdAt: string;
}
```

### 3. Event taxonomy

"Canonical" is the row a *per-event* view projects (e.g. a "Transfers" or "CC Payments" report). For spend/income, money-movement events have no projection at all: every grouping leg is set to `kind='transfer'` and disappears from spend AND income via the existing `kind` filters. This is the schema-level guarantee a transfer can never be summed.

| Event type | Cardinality | Members and roles | Canonical | Spend/income effect |
|---|---|---|---|---|
| **internal_transfer** | 2 legs (3 with a fee) | `source_debit` (acct A) + `dest_credit` (acct B); optional `fee_leg` | the debit, for a transfers view | both legs `kind='transfer'`, excluded from spend AND income; a `fee_leg` stays `kind='expense'` |
| **credit_card_payment** | 1 + 0..1 + 0..N | `bill_payment` (bank debit) + optional `dest_credit` (card-side credit, if the card account is tracked) + 0..N `underlying_purchase` (card line items, additive) | the `bill_payment`, for a payments view | bill + card-side credit `kind='transfer'` (excluded); underlying purchases keep `kind='expense'` and count once |
| **atm_withdrawal** | 1 (2 with fee) | `source_debit` (+ optional `fee_leg`) | the withdrawal | per `treatAtmAsTransfers`: filed under "Cash & ATM" as spend, or flipped `kind='transfer'` and excluded |
| **loan_repayment** | 2 | `source_debit` (checking) + `dest_credit` (loan acct, if tracked) | the debit | both legs `kind='transfer'`; an interest portion, if separable, may be a `fee_leg` expense |
| **investment_transfer** | 2 | `source_debit` (checking) + `dest_credit` (brokerage) | the debit | both `kind='transfer'`, excluded |
| **refund_reversal** | 2 (or 1 standalone) | `reversal_of` (the credit) + the original `underlying_purchase` it cancels | none | see "Refund handling" below; nets the original expense toward zero |
| **fee** | 1 (or `fee_leg` of a parent) | the fee row as `canonical` or `fee_leg` | the fee row | counts as expense, never excluded |

Cardinality notes that drive the schema:

- **The two-leg events** generalize today's `findInternalTransferPairs`. Today the paired rows are merely flipped to `kind='transfer'`; now they become an event with `source_debit`/`dest_credit` roles, a stored `confidence`, and `reasons`. The cross-account, opposite-sign, equal-`ABS(charged_amount)`, date-window logic in `internal-transfers.ts` becomes the candidate generator, with bucketing added (see scorer).
- **`credit_card_payment` is the one true one-to-many link** and is the gap the brief calls out. The bank `bill_payment` debit equals the *sum* of many card `underlying_purchase` rows, so it can never be paired 1:1 by amount. Two caveats the implementer must respect: (1) the sum is over `charged_amount` (the ILS-charged figure), not `original_amount`; purchases in foreign `original_currency` still settle in ILS, so summing `charged_amount` is correct, but FX-fee rows and rounding mean the bill rarely equals the sum to the agora. Attachment is therefore by *statement window + account linkage*, never by an exact-sum check. (2) Attachment is purely additive auditing: even if zero purchases are linked, flipping the single `bill_payment` leg to `kind='transfer'` already prevents double counting exactly as the existing migration `021_reclassify_credit_card_transfers.sql` does today.

**Canonical selection (deterministic):**

```typescript
function chooseCanonical(type: EventType, members: EventMembership[]): number | null {
  switch (type) {
    case "atm_withdrawal":
    case "fee":
      return members.find((m) => m.role === "canonical")?.transactionId
          ?? members[0]?.transactionId ?? null;
    case "internal_transfer":
    case "loan_repayment":
    case "investment_transfer":
      return members.find((m) => m.role === "source_debit")?.transactionId ?? null;
    case "credit_card_payment":
      return members.find((m) => m.role === "bill_payment")?.transactionId ?? null;
    case "refund_reversal":
      return null;
  }
}
```

Canonical is only ever used by *per-event* views, never by spend/income aggregation. Spend/income reads `kind` and nothing else.

### 4. How this maps onto and supersedes `kind`

`kind` stays exactly as it is and stays the fast path. The relationship is a strict, derivable invariant:

```
event type            => kind set on member rows
--------------------     -------------------------------------------------
internal_transfer     => both legs kind='transfer'
credit_card_payment   => bill_payment + dest_credit kind='transfer';
                         underlying_purchase rows keep kind='expense'
atm_withdrawal        => kind='transfer' (treatAtmAsTransfers) or 'expense'
loan_repayment        => both legs kind='transfer'
investment_transfer   => both legs kind='transfer'
refund_reversal       => see "Refund handling"
fee                   => kind='expense'
(no event)            => kind='expense' or 'income' (the common case)
```

`kind` is a **denormalized projection of grouping membership**: whenever a grouping event is created, confirmed, edited, split, or undone, each touched transaction's `kind` is re-synced through the *existing* `setTransactionKind` / `markTransfersByIds` in `queries/transactions.ts`. This is the backward-compatibility hinge:

- Every reporting query (`getMonthlySummary`, `getCategoryBreakdown`, `getPeriodTotal`, `getTransactionsSummary`, `getTopMerchants`, `getCategorySpendInRange`, etc.) **keeps filtering on `kind` and works unchanged**. None of them JOIN `financial_events`. The event layer's job is to *set* `kind` correctly and explain *why*.
- `detectKind` remains the cheap insert-time first pass, but note it only classifies `hapoalim`/`leumi` today. The grouping pass is the provider-agnostic second pass that confirms, groups, scores, and corrects across all providers, and records the audit trail.

**Refund handling (the one place that can silently hide or wrongly count money, so it is explicit):** a card refund arrives as a positive `charged_amount` on a card account. For card providers, `detectKind` does NOT mark it income (the income branch only fires for the two banks), so it defaults to `kind='expense'` with a positive amount, which reporting sums via `ABS(...)` as positive spend. That is a pre-existing latent bug the event layer must fix, not inherit. A `refund_reversal` event links the credit (`reversal_of`) to the original purchase. The chosen, auditable behavior: **leave both rows `kind='expense'`**, so the category's net spend in `getCategoryBreakdown`/`getCategorySpendInRange` is `SUM(ABS(charged_amount))` over a -100 and a +100 = 200, which is WRONG under the current `ABS` aggregation. Therefore the refund credit must be stored with `kind='income'` *or* the aggregation must net signed values. To avoid touching every aggregation query, the rule is: a matched refund credit is set `kind='income'` and linked; an *unmatched* positive card row stays `kind='expense'` only if it is genuinely income-like, otherwise it is flagged `needs_review`. This is called out because under the existing `ABS()`-based queries, any mishandled sign double-counts rather than hides, and double-counting a refund is the single most damaging silent error in this whole layer.

### 5. MatchCandidate and MatchRule

`MatchCandidate` is the staging area for *suggested* groupings (the Fellegi-Sunter clerical-review zone). High-confidence groupings skip straight to a `confirmed` `financial_events` row; medium-confidence ones land here for accept/reject.

```sql
CREATE TABLE match_candidates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  proposed_type TEXT NOT NULL CHECK(proposed_type IN (
                   'internal_transfer','credit_card_payment','atm_withdrawal',
                   'loan_repayment','investment_transfer','refund_reversal')),
  members       TEXT NOT NULL,        -- JSON: [{"transactionId":123,"role":"source_debit"},...]
  confidence    REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  score_detail  TEXT,                 -- JSON: per-feature comparison vector + weights
  reasons       TEXT,                 -- JSON array, same shape as financial_events.reasons
  -- guards stale candidates: a candidate referencing a since-deleted or
  -- already-grouped transaction is dropped at apply time (membership unique
  -- index enforces this), not surfaced.
  state         TEXT NOT NULL DEFAULT 'pending'
                  CHECK(state IN ('pending','accepted','rejected')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at   TEXT
);
CREATE INDEX idx_candidates_pending ON match_candidates(workspace_id, state);
```

`MatchRule` makes corrections sticky. The default text match is on the **raw `description`** (the bank original statement), which is stable, not a cleaned merchant name, matching Monarch's guidance and Spent's existing keyword regexes.

```sql
CREATE TABLE match_rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  description_pattern TEXT,          -- substring or /regex/ against raw description
  provider      TEXT,
  account_id    INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  amount_min    REAL,                -- on ABS(charged_amount)
  amount_max    REAL,                -- on ABS(charged_amount)
  set_kind      TEXT CHECK(set_kind IN ('expense','income','transfer')),
  set_event_type TEXT CHECK(set_event_type IN (
                   'internal_transfer','credit_card_payment','atm_withdrawal',
                   'loan_repayment','investment_transfer','fee')),
  set_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  hide          INTEGER NOT NULL DEFAULT 0,   -- maps to transactions.is_excluded
  priority      INTEGER NOT NULL DEFAULT 100, -- lower runs first
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_rules_workspace ON match_rules(workspace_id, enabled, priority);
```

```typescript
export interface MatchCandidate {
  id: number;
  workspaceId: number;
  proposedType: Exclude<EventType, "fee">;
  members: { transactionId: number; role: EventRole }[];
  confidence: number;
  scoreDetail: Record<string, unknown> | null;
  reasons: string[] | null;
  state: "pending" | "accepted" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
}

export interface MatchRule {
  id: number;
  workspaceId: number;
  descriptionPattern: string | null;
  provider: string | null;
  accountId: number | null;
  amountMin: number | null;
  amountMax: number | null;
  setKind: "expense" | "income" | "transfer" | null;
  setEventType: Exclude<EventType, "refund_reversal"> | null;
  setCategoryId: number | null;
  hide: boolean;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

`hide` maps onto the **existing** `transactions.is_excluded` column and the `excluded_merchants` table (migration 020). "Is a transfer" (`kind` / grouping) is a *separate* control from "hide from reports" (`is_excluded`); balances/net worth (computed from raw `charged_amount`) ignore both, exactly as Monarch documents. Only spend/income analytics honor them.

**Safety rule that prevents a rule from silently hiding a real expense:** a `set_kind='transfer'` rule with no `account_id` and no `amount_min` is rejected at save time. A blanket "everything matching this Hebrew substring is a transfer" rule is the single easiest way to vanish real spend. A transfer-setting rule must be scoped by at least one of `account_id` or an amount band, and the UI surfaces, before save, how many existing rows the rule would flip.

### 6. Confidence and the three-zone auto/suggest/ignore gate

Persisted `confidence` is the Fellegi-Sunter `P(match) = 2^M / (1 + 2^M)`, anchored to weight 4 ~ 0.95 and weight 7 ~ 0.99, and aligned to Plaid Enrich's `VERY_HIGH (>0.98) / HIGH (>0.90) / MEDIUM / LOW`. Thresholds are policy, stored in `workspace_settings` (the existing per-workspace key/value table from migration 013), not magic constants.

```typescript
// read from workspace_settings; these are defaults
const AUTO_CONFIRM = 0.95;   // write a confirmed financial_event (also syncs kind)
const SUGGEST_MIN  = 0.70;   // write a pending match_candidate for review
// below SUGGEST_MIN: discard

// HARD GUARD: a two-leg grouping may auto-confirm ONLY if it has the exact
// structural anchor (opposite-sign, equal ABS(charged_amount) within epsilon,
// DIFFERENT account). Fuzzy description similarity can never, on its own, push a
// pair past AUTO_CONFIRM. This is the schema-level promise that a real expense
// is never silently flipped to transfer on weak signal alone.
function gate(c: Candidate): "confirm" | "suggest" | "drop" {
  const p = c.confidence;
  if (p >= AUTO_CONFIRM && c.hasExactAmountAnchor) return "confirm";
  if (p >= SUGGEST_MIN) return "suggest";
  return "drop";
}
```

**The scorer (and the O(n^2) fix).** The candidate generator must not reproduce `findInternalTransferPairs`'s nested `debits x credits` loop over the whole window. First **bucket** the window's eligible rows by `(charged_currency, ROUND(ABS(charged_amount), 2))`. Opposite-sign exact-amount partners can only live in the same bucket, so comparison drops from O(n^2) to roughly O(n) plus small intra-bucket work. Only inside a bucket do we evaluate the date window and description signals. The same bucketing bounds the **backfill**: re-running pairing over tens of thousands of historical rows is quadratic if done naively, so the migration's app-side backfill iterates month-by-month windows, bucketed, and is idempotent (re-running it produces no new events because the membership unique index rejects duplicates).

Features and `log2(m/u)` weights:

- **opposite-sign, equal `ABS(charged_amount)` within `epsilon=0.01`, different `account_id`** (the existing `internal-transfers.ts` test, now using `account_id` with fallback to `credential_id`/`account_number`): the dominant positive signal, weight ~6. This is the `hasExactAmountAnchor` flag the gate requires.
- **date gap in days** (existing `dayWindow`, default 2; widened asymmetrically toward the future to absorb pending->posted settlement lag, ~1 week past / ~2 weeks future): full weight at gap 0, decaying to 0 at the window edge.
- **description matches `CREDIT_CARD_PAYMENT_PATTERNS` / `INTERNAL_TRANSFER_PATTERNS`** (the existing regex sets in `transfers.ts`): strong positive for the relevant type.
- **fuzzy description similarity** (new): normalize first for Hebrew/RTL: strip Unicode bidi control marks (U+200E/U+200F/U+202A-U+202E), strip niqqud (U+0591-U+05C7), normalize Hebrew final-letter forms to base forms, NFC-normalize, collapse whitespace; then Damerau-Levenshtein or token-set Jaccard. A **tiebreaker only**: it can lift a pair from `suggest` toward the top of the review queue, but per the hard guard it can never auto-confirm without the exact-amount anchor.

Every confirmed event and candidate stores `reasons` (human-readable, e.g. `["opposite-sign equal amount 1,250.00","dates 1 day apart","desc matched CREDIT_CARD_PAYMENT_PATTERNS: ויזה"]`) and `match_candidates.score_detail` (per-feature vector + weights), so every auto-decision is explainable.

**Reversal, split, and re-sync (idempotency).** No transaction row is ever deleted or mutated beyond `kind` / `category_id` / `is_excluded`; ledgers and balances stay intact.

- **Undo** = set `financial_events.state='rejected'` (tombstone, suppresses re-suggestion), delete its `event_memberships`, and recompute each freed member's `kind` via `detectKind`. Because `detectKind` only classifies `hapoalim`/`leumi`, a freed bank-side CC-payment row on those two banks would be re-flipped to transfer on the next pass; to make undo *stick*, undo also writes a narrow `match_rule` (or a `rejected` tombstone keyed on the member set) so the grouping pass does not immediately re-propose the rejected event. Without this, undo is not idempotent across syncs.
- **Split** = delete one membership, recompute canonical, re-sync `kind` for affected legs.
- **Leg deletion** = `event_memberships` cascades on transaction delete; the orchestrator must then recompute the surviving event (re-choose canonical, and if a two-leg event loses a leg, dissolve it and restore the survivor's `kind`). The `canonical_transaction_id` `ON DELETE SET NULL` only nulls the pointer; it does NOT restore the survivor's `kind`, so the recompute step is mandatory.
- **Re-sync safety**: the grouping pass is rerun every sync over the window. Idempotency rests on the membership unique index (`idx_memberships_one_grouping_leg`): an already-grouped row cannot be re-added as a second grouping leg, so reruns are no-ops on stable data. Candidates referencing a now-grouped or deleted transaction are dropped at apply time rather than surfaced.

---

Relevant grounding files for the implementing engineer: `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/lib/types.ts` (add the new interfaces/enums; `BANK_PROVIDERS` and `BankKind` drive `AccountType` seeding), `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/server/lib/transfers.ts` (note `isBankProvider` only covers `hapoalim`/`leumi`; `detectKind` is a two-bank first pass), `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/server/lib/internal-transfers.ts` (generalize into the bucketed candidate generator + scorer; today's loop is O(debits x credits)), `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/server/db/queries/transactions.ts` (`setTransactionKind`, `markTransfersByIds`, `getInternalTransferCandidates`, and the `kind`/`ABS(charged_amount)`-based reporting queries that stay unchanged; note the refund double-count risk under `ABS()` aggregation), and `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/server/db/migrations/` (migrations are applied in lexicographic filename order and tracked by filename in `_migrations`; duplicate `020_*`/`021_*` prefixes already exist; name the new file `022_financial_events.sql` so it sorts after `021_reclassify_credit_card_transfers.sql`).

---

## Deduplication Architecture

Spent already has a working intra-account exact deduper. This section keeps it untouched and wraps it in a second, additive layer that turns today's one-shot `kind`-flipping (`detectKind` at insert, `findInternalTransferPairs` after insert) into a persistent, auditable, reversible event-grouping pipeline. Both layers are deterministic, idempotent across re-syncs, and incremental over the sync window.

Three facts from the current code shape everything below, so they are stated up front rather than glossed over:

1. `isBankProvider` in `transfers.ts` currently recognizes **only** `hapoalim` and `leumi` as banks. `detectKind` therefore only ever flips bank rows from those two providers. Any design that says "for each bank debit" must NOT route through `isBankProvider`, or it silently ignores `mizrahi`, `discount`, `oneZero`, and every other bank. We instead drive bill detection off the credit-card keyword set plus "provider is not a card provider," and we expand `BANK_PROVIDERS_SET` as a prerequisite (tracked as a one-line change in `transfers.ts`).
2. The existing `getInternalTransferCandidates` pre-filters `kind != 'transfer'`. Once a row is flipped to transfer it becomes invisible to the next pairing pass. That is fine for the old fire-and-forget code but fatal for a reconcile-and-undo layer: a stale auto event could never be detected or rolled back. Layer 2 therefore reads candidates through a NEW query that does **not** pre-exclude transfers and instead excludes only rows already bound to a `confirmed`/`source='user'` event.
3. `is_excluded` (migration `020_excluded.sql`) exists on the row but is **not** referenced by any analytics `WHERE` clause in `transactions.ts`; every spend/income query filters on `kind` only. So the exclusion contract this layer must honor is `kind`, not `is_excluded`. We leave `is_excluded` alone and project through `kind`, exactly as `markTransfersByIds` does today.

### Two layers, one pipeline

```
                        ONE SYNC RUN (per workspace, in syncWorkspace)
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │                                                                                │
  │  LAYER 1  INTRA-ACCOUNT EXACT DEDUP   (UNCHANGED - src/server/lib/dedup.ts)    │
  │  ┌─────────────┐   ┌─────────────────────────────────────────────────────┐    │
  │  │ scrapeBank  │──▶│ insertTransactions(): computeDedupHash +             │    │
  │  │ (per cred)  │   │ dedup_sequence, ON CONFLICT pending->posted, idem.   │    │
  │  └─────────────┘   └─────────────────────────────────────────────────────┘    │
  │         runs inside syncOneCredential(), once per credential                   │
  │                                   │                                            │
  │                                   ▼ (all credentials inserted)                 │
  │  LAYER 2  CROSS-ACCOUNT EVENT GROUPING   (NEW - additive)                      │
  │                                                                                │
  │   (a) NORMALIZE      backfill match-key columns once, then window-only         │
  │           │          (norm_description, match_amount_cents)                    │
  │           ▼                                                                    │
  │   (b) BLOCK          candidate generation: bucket by abs(amount_cents)         │
  │           │          x date-window; cross-account only. Never O(n^2).          │
  │           ▼                                                                    │
  │   (c) SCORE          Fellegi-Sunter additive weights per candidate            │
  │           │          (sign, account, date gap, amount drift, desc sim,        │
  │           ▼           cc-payment / transfer keyword features)                  │
  │   (d) DECIDE         3 zones: auto-link | suggest (needs_review) | drop        │
  │           │          + N:1 aggregate pass for CC bill <-> purchases           │
  │           ▼                                                                    │
  │   (e) RECONCILE      upsert financial_events + event_members by deterministic  │
  │           │          event_key; retire stale auto memberships; pick canonical  │
  │           ▼                                                                    │
  │   (f) PROJECT        write kind='transfer' on excluded legs (back-compat);     │
  │                      purchase legs stay kind='expense' (no hidden spend)       │
  └──────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                        AI categorization (unchanged, skips kind='transfer')
```

Layer 1 answers "is this the same row I already stored?" (same account, same sign, exact hash). Layer 2 answers "do these N distinct rows describe one real-world money event?" (opposite sign, or one-to-many, across accounts). They are deliberately different problems with different candidate generation and different outputs (skip-insert vs link). 1:1 duplicate, opposite-sign transfer pair, and one-large-to-many-small aggregate are three distinct linkage tasks and are treated as such.

### New schema (additive migration `022_financial_events.sql`)

Migrations run inside `db.transaction()` with `foreign_keys` toggled off and re-verified by the runner (see `migrate.ts`), so this migration does not touch the pragma itself, and all of `CREATE TABLE` / `ALTER TABLE ADD COLUMN ... REFERENCES` / `CREATE INDEX` / `CREATE VIEW` are valid inside that transaction (verified against better-sqlite3). Nothing mutates or deletes a transaction row, so both account ledgers stay intact (the "link, do not collapse" rule).

```sql
-- 022_financial_events.sql

CREATE TABLE financial_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Deterministic key so a re-sync re-derives the SAME event id instead of
  -- spawning a duplicate. See computeEventKey() below.
  event_key     TEXT NOT NULL,
  event_type    TEXT NOT NULL CHECK(event_type IN (
                  'internal_transfer',     -- account A debit <-> account B credit
                  'credit_card_payment',   -- bank debit     <-> card credit (1:1 legs)
                  'cc_statement',          -- one card bill   <-> N card purchases (N:1)
                  'atm_withdrawal'         -- cash leaving a tracked account (single leg)
                )),
  status        TEXT NOT NULL DEFAULT 'suggested'
                  CHECK(status IN ('suggested','confirmed','rejected')),
  source        TEXT NOT NULL DEFAULT 'auto'
                  CHECK(source IN ('auto','user')),
  confidence    REAL,                       -- Fellegi-Sunter P(match), 0..1
  match_weight  REAL,                       -- log2 total match weight (auditable)
  -- Human-readable reasons + the raw comparison vector, so a merge is always
  -- explainable and undoable.
  reasons_json  TEXT,
  canonical_txn_id INTEGER REFERENCES transactions(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, event_key)
);

CREATE TABLE event_members (
  event_id       INTEGER NOT NULL REFERENCES financial_events(id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  workspace_id   INTEGER NOT NULL,
  -- 'outflow' / 'inflow' for pairs; 'bill' / 'purchase' for cc_statement N:1.
  role           TEXT NOT NULL CHECK(role IN ('outflow','inflow','bill','purchase')),
  -- The kind the leg had before THIS event excluded it. Restores precisely on
  -- undo / stale-retire. NULL means "we did not change this leg" (e.g. purchase
  -- legs in a cc_statement, which keep kind='expense').
  prior_kind     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  -- A transaction belongs to at most one event; re-running upserts in place.
  PRIMARY KEY (workspace_id, transaction_id)
);

CREATE INDEX idx_event_members_event ON event_members(event_id);

-- Match-key columns precomputed once, reused by every blocking pass.
ALTER TABLE transactions ADD COLUMN match_amount_cents INTEGER;  -- ROUND(charged_amount*100)
ALTER TABLE transactions ADD COLUMN norm_description   TEXT;     -- normalizeForMatch(description)
ALTER TABLE transactions ADD COLUMN event_id           INTEGER REFERENCES financial_events(id);

-- One-time backfill of the cent column for ALL existing rows, so the first
-- post-migration sync can match against history, not just the new window.
-- norm_description is backfilled lazily in stage (a) (it needs the JS
-- normalizer, which SQL cannot express) but match_amount_cents is pure SQL.
UPDATE transactions SET match_amount_cents = CAST(ROUND(charged_amount * 100) AS INTEGER);

-- Blocking index: candidate generation joins on (workspace, abs amount).
CREATE INDEX idx_txn_block ON transactions(workspace_id, match_amount_cents);
CREATE INDEX idx_txn_event ON transactions(workspace_id, event_id);
```

`event_id` on `transactions` is a denormalized pointer kept in sync with `event_members`, so the candidate query can cheaply exclude rows already bound to a human-confirmed event without a join. It is the only place that pointer is authoritative; `event_members` remains the source of truth for membership.

A note on the cent column: Layer 1's dedup hash is computed over `originalAmount` (the foreign-currency face value), but matching pairs across accounts must compare what actually moved in the shared currency, which is `charged_amount`. So `match_amount_cents` is deliberately derived from `charged_amount`, and every block additionally requires equal `charged_currency` so a 100 USD debit never pairs with a 100 ILS credit.

### Stage (a) Normalize

Runs after Layer 1 inserts. We need a Hebrew-aware normalizer because edit-distance and phonetic methods (Soundex, Metaphone) are unreliable on RTL and transliterated text, so we lean on amount and date as the high-signal fields and only normalize the string for a coarse comparator.

```typescript
// src/server/lib/event-grouping/normalize.ts
import "server-only";

const FINAL_FORMS: Record<string, string> = {
  "\u05da": "\u05db", // final kaf  -> kaf
  "\u05dd": "\u05de", // final mem  -> mem
  "\u05df": "\u05e0", // final nun  -> nun
  "\u05e3": "\u05e4", // final pe   -> pe
  "\u05e5": "\u05e6", // final tsadi-> tsadi
};

export function normalizeForMatch(description: string): string {
  return description
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")  // strip LRM/RLM/bidi controls
    .replace(/[\u0591-\u05c7]/g, "")              // strip niqqud / te'amim
    .replace(/[\u05da\u05dd\u05df\u05e3\u05e5]/g, (c) => FINAL_FORMS[c] ?? c)
    .replace(/\d{4,}/g, "#")                      // collapse long digit runs (ref/card #)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const toCents = (amt: number): number => Math.round(amt * 100);
```

Idempotency rule: `norm_description` is backfilled lazily. On every sync we run one bounded statement over the window plus any still-null row:

```sql
-- written from JS row-by-row inside a transaction, since normalizeForMatch is JS.
-- selection: rows in the window OR with norm_description still NULL.
SELECT id, description FROM transactions
WHERE workspace_id = ? AND (date >= ? OR norm_description IS NULL);
```

This never re-touches an already-normalized historical row twice on a normal sync, and `match_amount_cents` is already populated for all rows by the migration backfill, so blocking cannot silently drop a candidate for a NULL cent value. (In SQLite `-NULL = NULL`, which would make a NULL-cent row match nothing, so populating it eagerly is load-bearing, not cosmetic.)

### Stage (b) Block (candidate generation, never O(n^2))

The cheap, high-precision block for both transfers and CC-payment pairs is exact `abs(amount_cents)`, opposite sign, joined within a date window, scoped cross-account. Genuine pairs almost always agree on amount, so the block is exact-amount and the slack lives in the date. We use an asymmetric window biased to the future (about 1 week past, 2 weeks future) because the credit side of a transfer settles after the debit.

The cross-account predicate is the single most error-prone part and must exactly reproduce the current `isDifferentAccount` semantics: two rows are different accounts when **either** their credential ids are both present and differ, **or** their account numbers differ. A naive `COALESCE(b.credential_id,-b.id) IS NOT COALESCE(a.credential_id,-a.id) AND b.account_number <> a.account_number` is wrong: it fails to pair a checking-to-savings transfer under a single bank login (same `credential_id`, different `account_number`), which is one of the most common real cases in Israel. Verified empirically. The correct predicate:

```sql
-- src/server/db/queries/events.ts  (getTransferCandidatePairs)
SELECT a.id AS outflow_id, b.id AS inflow_id,
       a.norm_description AS a_desc, b.norm_description AS b_desc,
       a.provider AS a_provider, b.provider AS b_provider,
       a.date AS a_date, b.date AS b_date,
       a.charged_amount AS a_amt, b.charged_amount AS b_amt,
       a.dedup_hash AS a_hash, a.dedup_sequence AS a_seq,
       b.dedup_hash AS b_hash, b.dedup_sequence AS b_seq
FROM transactions a
JOIN transactions b
  ON b.workspace_id = a.workspace_id
 AND b.match_amount_cents = -a.match_amount_cents     -- equal magnitude, opposite sign
 AND a.charged_amount < 0 AND b.charged_amount > 0    -- a = outflow, b = inflow
 AND b.charged_currency IS a.charged_currency         -- same currency (NULL-safe)
 AND (
       (a.credential_id IS NOT NULL AND b.credential_id IS NOT NULL
        AND a.credential_id <> b.credential_id)
       OR a.account_number <> b.account_number
     )                                                -- mirrors isDifferentAccount
 AND julianday(substr(b.date,1,10)) - julianday(substr(a.date,1,10)) BETWEEN -7 AND 14
WHERE a.workspace_id = ?
  AND a.date >= ?                                     -- sync window anchor on outflow
  AND a.id NOT IN (SELECT transaction_id FROM event_members em
                   JOIN financial_events fe ON fe.id = em.event_id
                   WHERE em.workspace_id = a.workspace_id
                     AND (fe.status = 'confirmed' OR fe.source = 'user'))
  AND b.id NOT IN (SELECT transaction_id FROM event_members em
                   JOIN financial_events fe ON fe.id = em.event_id
                   WHERE em.workspace_id = b.workspace_id
                     AND (fe.status = 'confirmed' OR fe.source = 'user'));
```

Note what changed versus today's `getInternalTransferCandidates`: this query does **not** filter `kind != 'transfer'`. It must see already-flipped rows so the reconcile pass can re-evaluate and, if a prior auto match no longer holds, restore them. The only rows it excludes are those already locked into a human-confirmed/user event. Returned candidate count is `O(n * avg_bucket_size)`; the bucket keys on the exact cent amount via `idx_txn_block`, so it stays tiny even on tens of thousands of rows. This replaces the in-memory double loop in `findInternalTransferPairs` with an indexed SQL block, which is what keeps it sub-O(n^2).

A second, recall-recovery pass uses `match_amount_cents` bucketed to the nearest 10 agorot with a wider date window, to catch pending/posted drift where amounts shift slightly. Anything it surfaces can only ever become a `suggested` event, never an auto-link, because the amount disagreed.

The CC-statement N:1 block is separate and explicitly NOT a subset-sum search (subset-sum is exponential and would be both slow and dangerous). For each candidate bill (a non-card-provider row whose `norm_description` matches `CREDIT_CARD_PAYMENT_PATTERNS`, reused verbatim from `transfers.ts`), we take the card credential it names and sum **all** of that card's purchase rows whose `processed_date` falls in the billing window, then compare that single aggregate to the bill amount:

```sql
-- aggregate over the whole billing window, NOT a per-subset search
SELECT ABS(SUM(charged_amount)) AS purchases_total, COUNT(*) AS n
FROM transactions
WHERE workspace_id = ? AND credential_id = ?
  AND kind = 'expense'
  AND processed_date >= ? AND processed_date <= ?;
```

Because a missing or extra purchase would make the aggregate disagree, a `cc_statement` event is **only ever** created when the aggregate equals the bill within a tight tolerance (1 NIS), and even then it does not delete or net anything. It only excludes the bill leg (see stage (f)). If it does not balance, no `cc_statement` event is created and the bill is left to the ordinary `credit_card_payment` 1:1 path or to `detectKind`'s keyword flip. This guarantees the N:1 logic can never silently hide a real purchase.

### Stage (c) Score (Fellegi-Sunter additive weights)

Each pairwise candidate gets a transparent additive score. Per-feature `match weight = log2(m/u)`; total `M = sum of weights`; `P(match) = 2^M / (1 + 2^M)`, clamped to `[0,1]`. Anchors: `M=4 -> ~0.94`, `M=7 -> ~0.99`. We ship hand-set m/u priors (no labels needed to start; these can later be EM-tuned per workspace).

```typescript
// src/server/lib/event-grouping/score.ts
import "server-only";
import { matchesInternalTransfer, CREDIT_CARD_PAYMENT_PATTERNS } from "../transfers";

interface Feature { name: string; weight: number; } // log2(m/u)

export function scoreTransferPair(c: TransferCandidatePair): {
  weight: number; probability: number; reasons: Feature[];
} {
  const f: Feature[] = [];

  // Opposite-sign, cross-account is the defining transfer signal (strong).
  f.push({ name: "opposite_sign_cross_account", weight: 3.0 });

  // Exact amount agreement (m~0.99, u~0.02 at cent granularity in a workspace).
  // Compare in integer cents, never floats, to avoid 0.1+0.2 drift.
  if (c.aCents === -c.bCents) f.push({ name: "exact_amount", weight: 4.0 });
  else f.push({ name: "amount_drift", weight: -2.0 }); // rounded-bucket pass only

  // Date proximity, decaying with the gap.
  const gap = Math.abs(dayGap(c.aDate, c.bDate));
  if (gap === 0) f.push({ name: "same_day", weight: 2.0 });
  else if (gap <= 2) f.push({ name: "date_within_2d", weight: 1.0 });
  else f.push({ name: "date_within_window", weight: 0.0 }); // already in-window by block

  // Keyword evidence (reuses existing regexes; no new keyword lists). Run on the
  // RAW description, because CREDIT_CARD_PAYMENT_PATTERNS were authored against
  // raw bank text; norm_description strips digit runs and could weaken a match.
  const ccHit = CREDIT_CARD_PAYMENT_PATTERNS.some((re) => re.test(c.aRawDesc) || re.test(c.bRawDesc));
  const xferHit = matchesInternalTransfer(c.aRawDesc) || matchesInternalTransfer(c.bRawDesc);
  if (ccHit) f.push({ name: "cc_payment_keyword", weight: 2.0 });
  else if (xferHit) f.push({ name: "internal_transfer_keyword", weight: 1.5 });

  // Description similarity on the normalized strings (coarse, tie-breaker only).
  const sim = jaroWinkler(c.aDesc, c.bDesc);
  if (sim >= 0.9) f.push({ name: "desc_similar", weight: 1.0 });

  const weight = f.reduce((s, x) => s + x.weight, 0);
  const probability = Math.min(1, Math.max(0, 2 ** weight / (1 + 2 ** weight)));
  return { weight, probability, reasons: f };
}
```

Backward-compat: today's `findInternalTransferPairs` requires a keyword on at least one side AND exact amount AND a 2-day window as a hard gate. Those become weighted features. A keyword-less pair that is exact-amount, same-day, cross-account scores `3.0 + 4.0 + 2.0 = 9.0 -> P ~ 0.998`, so it now auto-links where the old code missed it for lack of a keyword. A keyword-present, exact-amount, within-2-day pair scores `>= 6.5 -> P ~ 0.99`, preserving prior behavior. Crucially, the recall expansion only ever *adds* exclusions for clean exact-amount cross-account pairs; it never expands by relaxing the amount, so it cannot start hiding ordinary spend that merely shares a keyword.

### Stage (d) Decide (three zones, auto vs suggest)

Two policy thresholds, not one cutoff (Fellegi-Sunter clerical-review model):

```typescript
const AUTO_LINK = 0.97;     // >= 0.97 -> event created, both legs flipped to transfer now
const SUGGEST   = 0.80;     // [0.80, 0.97) -> suggested event, needs_review on legs, kind UNCHANGED
// < 0.80 -> candidate dropped, no event row
```

- `P >= 0.97`: create/refresh a `financial_events` row and immediately flip the excluded legs to `kind='transfer'` (so analytics are correct now), recording each leg's `prior_kind`. `needs_review` stays false. Exact-amount same-day internal transfers and matched CC-payment pairs land here. This matches every aggregator's rule: classify both legs of a card-bill payment as transfer and exclude both, never net them against purchases.
- `0.80 <= P < 0.97`: create the event but leave both legs' `kind` unchanged and set `needs_review = 1` via the existing `batchSetNeedsReview`. Spend/income totals are unaffected until the user confirms in the review UI; confirming sets `status='confirmed'`, `source='user'` and applies the exclusion. Choosing to leave `kind` unchanged in this band is deliberate: a borderline auto-exclusion that hid a real expense would be a silent data error, so borderline cases must surface, not disappear.
- `P < 0.80`: nothing written.

Greedy 1:1 assignment is preserved and made reproducible: candidates are processed in descending `P`, ties broken by `(min(a_hash,b_hash), max(a_hash,b_hash))` so the order is identical on every run regardless of row id churn. A transaction already claimed by a higher-scoring event is skipped (enforced by the `event_members` PK). This bounds the blast radius of a bad match and prevents transitive chaining across low-confidence edges.

The `cc_statement` N:1 decision is separate and never goes through the pairwise scorer: it is created only on exact aggregate balance (stage (b)) and only ever excludes the bill leg.

### Stage (e) Reconcile (idempotent grouping, deterministic event keys)

Re-running a sync must not create duplicate events or thrash assignments. Solved with a deterministic `event_key` derived only from stable transaction facts, plus an upsert:

```typescript
// src/server/lib/event-grouping/keys.ts
import "server-only";
import crypto from "node:crypto";

// Order-independent over the participating (dedup_hash, dedup_sequence) pairs,
// so the same set of legs always yields the same key regardless of scan order.
export function computeEventKey(
  eventType: string,
  legs: { dedupHash: string; seq: number }[],
): string {
  const ids = legs.map((l) => `${l.dedupHash}:${l.seq}`).sort().join("|");
  return crypto.createHash("sha256").update(`${eventType}\u0000${ids}`).digest("hex");
}
```

Keying on `(dedup_hash, dedup_sequence)` rather than the autoincrement `id` means the key survives re-insertion and composes with Layer 1, which guarantees those identifiers are stable and idempotent. Reconcile, all inside one `db.transaction()`:

```typescript
for (const decided of decisions) {                 // auto-link + suggest decisions
  const key = computeEventKey(decided.type, decided.legs);
  const existing = getEventByKey(workspaceId, key); // UNIQUE(workspace_id, event_key)
  if (existing) {
    // Never overwrite a human decision.
    if (existing.status === "confirmed" || existing.source === "user") continue;
    upsertEventMeta(existing.id, decided.confidence, decided.matchWeight, decided.reasons, decided.canonicalTxnId);
  } else {
    const eventId = insertEvent(workspaceId, key, decided);
    for (const leg of decided.legs) {
      const prior = getTransactionKind(workspaceId, leg.txnId); // capture before flip
      upsertMember(eventId, leg.txnId, leg.role, leg.excluded ? prior : null);
      setTransactionEventId(workspaceId, leg.txnId, eventId);
    }
  }
}

// Retire stale AUTO memberships: any auto/suggested event in the window whose
// legs no longer clear SUGGEST is deleted; legs whose prior_kind was recorded
// are restored to prior_kind, and their event_id cleared. Confirmed/user events
// are untouched.
reconcileStaleAutoEvents(workspaceId, fromDate);
```

Because the key is content-addressed and confirmed/user events are skipped, re-running over the same window is a no-op, and a user's confirm/reject/split survives every subsequent sync. This is the generalization of today's `markTransfersByIds(findInternalTransferPairs(...))` + `batchSetNeedsReview`: "upsert events, then project `kind` from event membership." Critically, because the candidate query (stage (b)) no longer pre-filters `kind`, a row that was auto-flipped last sync but whose partner has since vanished (for example a pending row that never posted) will be re-evaluated, score below threshold, and have its `kind` restored from `prior_kind`. That restore path did not and could not exist in the old code.

Incrementality: the pipeline evaluates only rows with `date >= fromDate` (anchored on the outflow side) plus any row already in a `suggested`/`auto` event touched by the window. It never does a full rebuild on a normal sync. A full rebuild is a separate explicit maintenance action (`rebuildEvents(workspaceId)`), useful after the user widens `monthsToSync`; it clears `event_id`/auto events and re-runs over all history while leaving confirmed/user events intact.

### Stage (f) Project (analytics read path)

Reporting keeps reading the same `kind='expense'` / `kind='income'` filters used in every query in `transactions.ts`, so the dashboard is untouched. Projection is: set `kind='transfer'` on auto-linked and confirmed *excluded* legs (internal-transfer pairs both legs; CC-payment pairs both legs; ATM legs), exactly as `markTransfersByIds` does today. The event layer is additive metadata on top of the unchanged `kind` contract. We do **not** rely on `is_excluded` for this, because no analytics query reads that column.

For the N:1 `cc_statement` case the projection is asymmetric, matching Monarch/YNAB/Copilot: the **bill payment leg** is set `kind='transfer'` (excluded, `prior_kind` recorded), while the **purchase legs stay `kind='expense'`** and remain the single source of spend (their `event_members.prior_kind` is NULL, signalling "we did not change this leg"). The event row makes the previously-invisible relationship auditable ("this 4,200 NIS Isracard debit is composed of these 37 purchases") without changing a single analytics number. A thin view backs any future "show me the event behind this transfer" UI:

```sql
CREATE VIEW v_transaction_events AS
SELECT t.id AS transaction_id, t.workspace_id, em.role, em.prior_kind,
       fe.id AS event_id, fe.event_type, fe.status, fe.confidence,
       fe.canonical_txn_id, fe.reasons_json
FROM transactions t
JOIN event_members em ON em.workspace_id = t.workspace_id AND em.transaction_id = t.id
JOIN financial_events fe ON fe.id = em.event_id;
```

### Canonical selection

For a pair, the canonical (representative) transaction is the **outflow** leg (the debit), since that is what the user recognizes as "the payment." For a `cc_statement` event the canonical is the **bill** leg. Canonical is stored on `financial_events.canonical_txn_id` and is what a "transfers" or "events" report displays as the one row per event, avoiding the double-count that listing all legs would cause.

### Sequence for one sync run (inside `syncWorkspace`)

1. For each credential, `syncOneCredential` runs Layer 1 unchanged (`insertTransactions`, idempotent ON CONFLICT, which already preserves `kind` via `kind = transactions.kind`). No event logic here, so a single credential's insert is never blocked on cross-account data.
2. After all credentials are inserted, replace the current block at `orchestrator.ts` lines 409-418 with a single call to `groupFinancialEvents(workspaceId, fromDate)`, in the exact spot where `findInternalTransferPairs(...)` is invoked today.
3. `groupFinancialEvents` runs (a) normalize, (b) block (transfer pairs + CC-statement N:1), (c) score, (d) decide, (e) reconcile/upsert/retire, (f) project `kind`. It returns counts surfaced over SSE as a new `stage: "grouping"` event for the sync UI.
4. ATM handling (`getAtmExpenseCandidates` / `treatAtmAsTransfers`) folds into the same layer as `event_type='atm_withdrawal'` single-leg events, so its `kind`-flipping is now recorded with `prior_kind` and is undoable too. The non-transfer ATM path (filing under "Cash & ATM") stays as-is, since it sets a category, not a `kind`.
5. AI categorization runs last, unchanged, and continues to skip `kind='transfer'` (it filters `category_id IS NULL AND kind = ?` per kind), so excluded legs are never sent to the model.

### Prerequisite and replaced / generalized code

- **Prerequisite:** widen `BANK_PROVIDERS_SET` in `transfers.ts` beyond `["hapoalim","leumi"]` to the full bank list (`mizrahi`, `discount`, `oneZero`, etc.) before the CC-statement block can recognize their bills. Until then, `detectKind` and the bill detector only fire for the two providers, so the N:1 path is effectively dead for the rest. This is a one-set change but is load-bearing and must ship in the same PR.
- `findInternalTransferPairs` (in-memory greedy double loop, hard keyword gate) is superseded by the SQL block plus the Fellegi-Sunter scorer. It can remain as a pure, unit-testable helper, but the orchestrator calls `groupFinancialEvents` instead of `markTransfersByIds(findInternalTransferPairs(...))`.
- `detectKind` at insert time stays as the cheap first guess (it sets the initial `kind` so single-account data and the non-paired majority are correct immediately), but the event layer is authoritative and can override or restore it via `prior_kind`.
- `markTransfersByIds` and `batchSetNeedsReview` are still used, now driven by event decisions rather than ad-hoc pair lists. A new `restoreKindFromPriorKind` helper backs the stale-retire and user-reject paths.

Relevant files for implementation: new `src/server/lib/event-grouping/{normalize,score,keys,group}.ts`, new `src/server/db/queries/events.ts`, new migration `src/server/db/migrations/022_financial_events.sql`, the `BANK_PROVIDERS_SET` widening in `src/server/lib/transfers.ts`, a new non-kind-filtering candidate query alongside `getInternalTransferCandidates` in `src/server/db/queries/transactions.ts`, and the swap in `src/server/sync/orchestrator.ts` at lines 409-418.

---

## Matching Algorithms and Confidence Scoring

This section specifies how Spent generates candidate links between transaction rows, scores them, and decides whether to auto-merge, suggest, or ignore. It generalizes the keyword-only `detectKind` / `findInternalTransferPairs` logic (`src/server/lib/transfers.ts`, `src/server/lib/internal-transfers.ts`) into a feature-scored matcher that emits a persisted confidence and human-readable reasons. The event-grouping schema (`financial_events`, `event_members`) and the review/undo workflow are specified in their own sections; here we produce the `(score, reasons, event_type, member_ids)` tuple that those layers consume.

Three invariants are absolute and constrain everything below:

1. The matcher never deletes rows, never mutates `charged_amount`, and never nets one row against another. It only proposes links. The underlying card purchases always remain the single source of truth for spend, exactly once.
2. The matcher only ever flips rows OUT of spend/income into `transfer`. It never flips a `transfer` back to `expense` (that is the undo path's job, driven by event deletion), and it never reclassifies a row a user has touched (`category_source = 'user'` or `kind` set by a prior accepted event).
3. Every auto-decision is explainable (persisted `reasons[]` and feature vector) and reversible (delete event, restore prior `kind`).

Design stance, grounded in research: Monarch, Copilot, and Simplifi all avoid double-counting credit-card bills by typing both legs as transfers and excluding them by category, and none publicly document a real two-sided pair matcher. We go further (true pair linking is the differentiator) but adopt their safety stance: matching is reversible and the card purchases remain the spend. We borrow the three-zone auto/suggest/ignore decision model and additive log-weight scoring from the record-linkage literature (Fellegi-Sunter, Splink), and Plaid's confidence gate (VERY_HIGH > 98%, HIGH > 90%, MEDIUM, LOW) as the action threshold.

### 1. Normalization

All fuzzy comparison runs on a normalized form of `description` (and `memo`), never the raw string. Israeli scraper descriptions are mostly Hebrew RTL, occasionally English, and carry provider boilerplate plus masked card digits. Hebrew is hostile to phonetic and transliteration methods (Soundex/Metaphone are English-bound), so we normalize aggressively in the original script and lean on amount/date as the high-signal fields.

```typescript
// src/server/lib/matching/normalize.ts
import "server-only";

const RTL_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g; // LRM/RLM/embeddings/isolates
const NIQQUD = /[\u0591-\u05c7]/g; // Hebrew cantillation + vowel points

// Final-form Hebrew letters folded to their base form so a word at the end of a
// description collapses with the same word mid-string. Keyed by code point.
const HEBREW_FINALS: Record<string, string> = {
  "\u05da": "\u05db", // ך -> כ
  "\u05dd": "\u05de", // ם -> מ
  "\u05df": "\u05e0", // ן -> נ
  "\u05e3": "\u05e4", // ף -> פ
  "\u05e5": "\u05e6", // ץ -> צ
};
const HEBREW_FINALS_RE = /[\u05da\u05dd\u05df\u05e3\u05e5]/g;

// Provider/statement boilerplate that adds no merchant signal. Extend as banks
// reveal patterns. NOTE: these are stripped only for FUZZY comparison; the
// CC-payment and transfer keyword classifiers in transfers.ts still see the raw
// description, so removing "חיוב" here does not weaken classification there.
const BOILERPLATE: readonly RegExp[] = [
  /\u05d1\u05e2"?\u05de/g, // בע"מ (Ltd.)
  /\bLTD\.?\b/gi,
  /\bINC\.?\b/gi,
  /\u05e4\u05e2\u05d5\u05dc\u05d4/g, // פעולה (transaction filler)
  /\u05ea\u05e9\u05dc\u05d5\u05dd\s+\d+\s+\u05de\u05ea\u05d5\u05da\s+\d+/g, // "תשלום N מתוך M"
];

// Masked card / reference digits: "****1234", "xx-1234", standalone 4-6 digit runs.
const MASKED_DIGITS = /(?:[*xX#]{2,}[\s-]*)?\d{4,6}\b/g;

export interface NormalizedDescription {
  /** Lowercased, RTL-stripped, boilerplate-folded canonical string. */
  canonical: string;
  /** Sorted unique token set for Jaccard / token-set similarity. */
  tokens: string[];
  /** Any masked card / reference digit groups, pulled out as their own signal. */
  digitGroups: string[];
}

export function normalizeDescription(raw: string): NormalizedDescription {
  // Extract digit groups BEFORE stripping, normalize each to bare digits, then
  // keep only the trailing 4 so "****1234" and "xx-1234" and "1234" all unify.
  const digitGroups = Array.from(
    new Set((raw.match(MASKED_DIGITS) ?? []).map((d) => d.replace(/\D/g, "").slice(-4))),
  ).filter((d) => d.length === 4);

  let s = raw.normalize("NFKC").replace(RTL_MARKS, "").replace(NIQQUD, "");
  s = s.replace(HEBREW_FINALS_RE, (c) => HEBREW_FINALS[c] ?? c);
  for (const re of BOILERPLATE) s = s.replace(re, " ");
  s = s.replace(MASKED_DIGITS, " ");
  s = s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // drop punctuation, keep Hebrew + Latin letters and numbers
    .replace(/\s+/g, " ")
    .trim();

  const tokens = Array.from(new Set(s.split(" ").filter((t) => t.length > 1))).sort();
  return { canonical: s, tokens, digitGroups };
}
```

Key choices and why:

- Strip RTL control marks first. Israeli scrapers embed `\u200f`/`\u200e` inconsistently, so two visually identical descriptions can differ byte-for-byte. This is also why the existing `computeDedupHash` over the raw `description` can occasionally let a pending row and its posted twin escape exact dedup. Normalizing closes that gap for the fuzzy layer WITHOUT touching the exact-hash layer (the hash stays raw; see section 8).
- Unify final-form Hebrew letters (ם→מ etc.) so a word at the end of a description collapses with the same word mid-string. We keep niqqud-stripping and final-letter folding and deliberately do NOT transliterate, since transliteration explodes one Hebrew name into thousands of Latin variants.
- Pull masked card digits into `digitGroups` (normalized to the bare last-4) rather than leaving them inline. The last-4 is a strong link between a bank debit ("חיוב כרטיס ...1234") and a card account; inline it is just noise. Last-6 is reduced to last-4 because providers mask inconsistently; matching on last-4 is the reliable common denominator.

### 2. Blocking (candidate generation, never O(n^2))

Full pairwise comparison over a sync window scales quadratically and is infeasible at tens of thousands of rows. We block first, comparing only rows that share a cheap key, then score within blocks. The cheapest high-precision block is exact rounded amount plus currency plus a date bucket, because genuine opposite legs almost always agree on magnitude (the slack is in the date).

Candidate rows are always scoped to one workspace and bounded to the sync window, mirroring the existing `getInternalTransferCandidates(workspaceId, from)`. Two passes (a disjunction of keys) recover recall: an exact-amount pass (can reach auto) and a whole-shekel pass that absorbs FX and rounding drift (suggest-only).

A correctness note on the join predicate. SQLite's `=` already treats two non-NULL currencies correctly, but NULL currencies must be matched explicitly, because `NULL = NULL` is NULL (false) in a WHERE/ON clause. We therefore compare a coalesced currency, not the bare column. We also gate both sides on `category_source IS NOT 'user'` and `kind <> 'transfer'` so the matcher never re-touches a row a user owns or a row a prior accepted event already classified (invariant 2).

```sql
-- Pass 1: exact opposite-sign pairs within a date window, same workspace.
-- Bounded by the amount+currency block (each bucket holds a handful of rows),
-- so it is near-linear in practice. Debit (negative) joined to credit (positive).
SELECT d.id AS debit_id, c.id AS credit_id,
       d.charged_amount AS debit_amount, c.charged_amount AS credit_amount,
       d.date AS debit_date, c.date AS credit_date,
       d.account_number AS debit_acct, c.account_number AS credit_acct,
       d.credential_id AS debit_cred, c.credential_id AS credit_cred,
       d.provider AS debit_provider, c.provider AS credit_provider,
       d.description AS debit_desc, c.description AS credit_desc,
       d.type AS debit_type, c.type AS credit_type
FROM transactions d
JOIN transactions c
  ON c.workspace_id = d.workspace_id
 AND COALESCE(c.charged_currency, '') = COALESCE(d.charged_currency, '')
 AND ROUND(ABS(c.charged_amount), 2) = ROUND(ABS(d.charged_amount), 2)  -- exact magnitude
 AND c.charged_amount > 0 AND d.charged_amount < 0                       -- opposite sign
 AND c.id <> d.id
 AND (                                                                   -- different account
       c.credential_id IS NULL OR d.credential_id IS NULL
       OR c.credential_id <> d.credential_id
       OR c.account_number <> d.account_number
     )
 AND ABS(julianday(substr(c.date, 1, 10)) - julianday(substr(d.date, 1, 10))) <= :dayWindow
WHERE d.workspace_id = :workspaceId
  AND d.date >= :from
  AND d.kind <> 'transfer' AND c.kind <> 'transfer'
  AND d.category_source IS NOT 'user' AND c.category_source IS NOT 'user'
  AND d.charged_amount <> 0;
```

To make this index-driven instead of a full scan, add a covering expression index on the blocking columns. The leading columns must match the equality predicates in the ON clause; `date` trails so the planner can range-probe the date window:

```sql
CREATE INDEX IF NOT EXISTS idx_txn_block_amount
  ON transactions (
    workspace_id,
    charged_currency,
    ROUND(ABS(charged_amount), 2),
    date
  );
```

SQLite supports indexes on the deterministic expression `ROUND(ABS(charged_amount), 2)`, so the join probes the index per debit row. Caveat that must be respected: the index uses bare `charged_currency`, while the join uses `COALESCE(charged_currency, '')`. The planner will only use the index for the currency equality when the predicate is on the bare column. We therefore split the candidate fetch by currency-presence in the calling code (one parameterized query for non-NULL currency that uses the index, a rare fallback for NULL currency that does not), rather than wrapping the column in COALESCE inside the indexed predicate. Israeli scrapers virtually always populate `charged_currency` (default ILS), so the NULL branch is a cold path.

Pass 2 is identical but blocks on `ROUND(ABS(...), 0)` (whole-shekel) with a wider `:dayWindow`. It backs a second index `idx_txn_block_amount_shekel` on `(workspace_id, charged_currency, ROUND(ABS(charged_amount), 0), date)`. Pass 2 only ever produces suggest-tier candidates, never auto-merges, because a rounded-amount match is inherently lower precision. For credit-card-bill reconciliation, blocking is different (one-to-many, sum-based) and is specified in section 5.2.

Idempotency of candidate generation: rows already in an accepted event are skipped by the `kind <> 'transfer'` filter (accepted events flip members to `transfer`). Rows in a still-pending suggested event are skipped by joining against `event_members` for events in `state = 'suggested'` (defined in the schema section) so a re-sync does not generate duplicate suggestions for the same pair. The pipeline (section 7) enforces this with a `claimed` set seeded from existing event members.

### 3. Feature set

For each candidate pair the matcher computes a feature vector. Exact/numeric comparators run on the high-signal fields (amount, date, sign, account/provider kind); fuzzy string comparators run only on the normalized description. This is the core guidance: do not waste fuzzy logic where exact equality is the right test.

| Feature | Type | Definition |
|---|---|---|
| `amountExact` | bool | `ROUND(abs(a),2) === ROUND(abs(b),2)` |
| `amountTolerance` | float 0..1 | `1 - min(1, abs(abs(a)-abs(b)) / (abs(a) * FX_TOL))`; `FX_TOL = 0.02` to absorb FX + rounding when currencies differ |
| `oppositeSign` | bool | `sign(a) !== sign(b)` and neither is 0 |
| `dateGapDays` | int | signed `creditDay - debitDay`; settlement runs forward, so the window is asymmetric (favor credit on or after the debit) |
| `dateProximity` | float 0..1 | `max(0, 1 - abs(dateGapDays) / DATE_HORIZON)`, `DATE_HORIZON = 5` |
| `crossAccount` | bool | different `credential_id`, or different `account_number` when credential is shared/null (reuses `isDifferentAccount`) |
| `directionMatch` | bool | source and dest account `kind` are consistent with the event type (e.g. CC payment = `bank` debit + `card` credit, via `BankProviderInfo.kind`) |
| `descJaroWinkler` | float 0..1 | Jaro-Winkler over the two `canonical` strings |
| `descTokenSet` | float 0..1 | token-set ratio (Jaccard over `tokens`) |
| `digitOverlap` | bool | any shared `digitGroups` entry (shared masked card last-4) |
| `keywordTransfer` | bool | either side matches the internal-transfer keyword set (via `matchesInternalTransfer`) |
| `keywordCardPayment` | bool | either side matches the CC-payment keyword set (via a new `matchesCreditCardPayment` exported from `transfers.ts`) |
| `installmentConsistent` | bool | `type`/`installmentTotal` agree (an installments row should not pair with a one-shot transfer) |

The provider `kind` (`bank` vs `card`) comes from `BANK_PROVIDERS` in `src/lib/types.ts` (`BankProviderInfo.kind: BankKind = "bank" | "card"`), looked up by the row's `provider` column. This replaces the brittle hardcoded `BANK_PROVIDERS_SET = new Set(["hapoalim", "leumi"])` currently in `transfers.ts`, which is wrong: it omits mizrahi, discount, oneZero, and every other bank, so `detectKind` today silently misclassifies their credits as `expense`. Section 8 specifies the required refactor of `isBankProvider` to read `BANK_PROVIDERS` instead.

Two functions the draft assumed are reusable but are not yet exported must be added in `transfers.ts`: the internal-transfer regex set is private (only `matchesInternalTransfer` is exported, which is sufficient for `keywordTransfer`), and there is no `matchesCreditCardPayment` predicate (only the private `matchesTransferPattern` over `CREDIT_CARD_PAYMENT_PATTERNS`). We export `matchesCreditCardPayment` as a thin wrapper so the feature builder reuses the single regex source.

### 4. Fuzzy string similarity: which metric and why

We use two complementary string comparators and take their max as the description signal, because Israeli merchant/transfer descriptions vary in both spelling and token order:

- Jaro-Winkler (`descJaroWinkler`) for spelling drift with a reliable prefix. Israeli statements tend to keep a stable leading token (the bank/branch or "העברה" prefix) and vary the tail, which the Jaro-Winkler prefix bonus rewards. Caveat: Jaro-Winkler is unreliable on very short strings, so we gate it (`canonical.length >= 4` on both sides) and fall back to token-set otherwise.
- Token-set ratio / Jaccard (`descTokenSet`) for reordered or extra tokens. Bank descriptions frequently reorder ("העברה לחשבון" vs "לחשבון העברה") or add a branch token; set overlap ignores order.

Damerau-Levenshtein (handles adjacent transpositions, common in Hebrew typos) is a reasonable alternative to Jaro-Winkler behind the same interface; we default to Jaro-Winkler for the prefix behavior. Embeddings (Sentence-BERT for "AMZN" ~ "Amazon") are explicitly out of scope for v1: they add a model dependency to a local-only app and the research positions them as an optional extra comparator, not a replacement for the transparent scorer. We leave a seam (`descSemantic?: number`) in the feature vector so a future optional embedding signal slots in additively.

Thresholds for the description signal: `descSim = max(descJaroWinkler, descTokenSet)`. We treat `>= 0.90` as strong agreement, `0.75 .. 0.90` as weak agreement, `< 0.75` as disagreement. These feed the weighted score below rather than gating on their own, since amount + date + opposite-sign carry most of the discriminative power for transfers (Hebrew description quality is too noisy to gate on).

### 5. Per-event-type matching rules

Each event type has its own candidate generator and scoring profile. The matcher runs them in priority order (CC payment, then internal transfer, then ATM, then loan/investment) and a row belongs to at most one accepted event.

#### 5.1 internal_transfer (1:1 opposite legs)

This generalizes `findInternalTransferPairs`. Candidate = opposite-sign, cross-account, same-currency (or FX-tolerant), amounts equal within tolerance, dates within window. The current code requires a transfer keyword on at least one side as a HARD gate (lines 99-103 of `internal-transfers.ts`); we soften that into a scored feature so a keyword-less but otherwise perfect pair (exact amount, opposite sign, cross-account, 0-day gap) can still reach the suggest tier instead of being silently dropped. Person-to-person payments (the main false positive per Monarch) stay in suggest, never auto-merge, because they look identical to internal transfers but are real outflows.

We preserve the existing greedy, deterministic 1:1 selection (`sortKey` order, closest-date wins, no credit reused) so behavior on currently-matched pairs is unchanged; scoring is layered on top, not substituted.

#### 5.2 credit_card_payment (1:1 leg AND the N:1 bill link)

This is the hard, high-value case, with two distinct linkages that must NOT be conflated:

1. The transfer-pair leg: the bank debit ("חיוב כרטיסי אשראי ...1234", `provider.kind === "bank"`, negative) pairs 1:1 with the credit posted on the card account ("תשלום/זיכוי", `provider.kind === "card"`, positive). This is an ordinary opposite-sign pair, scored like an internal transfer but with `keywordCardPayment` and `directionMatch (bank->card)` adding weight, and `digitOverlap` (shared last-4) a strong bonus. Both legs become `kind = 'transfer'`. Critically, MANY card scrapers do NOT emit a payment-credit row on the card account, so this leg is often absent. The design must not require it: in its absence we fall straight to linkage 2 and classify the bank debit alone as `transfer` on keyword + provider, exactly as `detectKind` does today.

2. The bill-to-purchases aggregate link: the single bank debit equals the SUM of the card account's purchases within a billing cycle. This is one-to-many and must NEVER be matched by per-transaction amount similarity. We link the bill to the set of purchases for audit/visibility, but we do NOT net them: the purchases remain the spend, exactly once. This is precisely what today's design lacks: the bill is flagged `transfer` so it is not double-counted, but the relationship is invisible and unauditable.

```typescript
// src/server/lib/matching/cc-bill.ts (pseudocode)
// For each bank debit that looks like a CC bill payment, find the card-account
// purchase set whose ABS-sum matches the debit within a cycle window.

const CYCLE_WINDOW_DAYS = 38; // Israeli cards bill monthly; ~35 days + slack.

interface CcBillMatch {
  billTxnId: number;
  cardCredentialId: number;
  memberPurchaseIds: number[];
  sumAbs: number;
  residual: number; // abs(billAbs - sumAbs)
  reasons: string[];
  memberConfidence: "auto" | "suggest";
}

function reconcileCcBill(bill: BankDebit, cardPurchases: CardPurchase[]): CcBillMatch | null {
  const billAbs = Math.abs(bill.chargedAmount);

  // Card purchases this bill plausibly settles: same currency, in the cycle
  // window ENDING at the bill date (purchases precede settlement). Exclude
  // installments-future rows and any row a user owns.
  const windowed = cardPurchases.filter(
    (p) =>
      p.kind === "expense" &&
      p.categorySource !== "user" &&
      (p.chargedCurrency ?? "") === (bill.chargedCurrency ?? "") &&
      daysBetween(p.date, bill.date) >= 0 &&
      daysBetween(p.date, bill.date) <= CYCLE_WINDOW_DAYS,
  );
  if (windowed.length === 0) return null;

  const fullSum = sumAbs(windowed);

  // Exact cycle total: cheap, exact, the common happy path. Auto-confirm the link.
  if (approxEqual(fullSum, billAbs, 0.01)) {
    return mk(bill, windowed, fullSum, billAbs, ["Bill equals full cycle total of N purchases"], "auto");
  }

  // Otherwise: partial/minimum payment, or installments split the cycle. Do NOT
  // attempt subset-sum (NP-hard; a WRONG subset is worse than none, and could
  // hide a real expense if it ever drove netting). Link to the whole cycle with
  // a residual note and leave the member set in SUGGEST. The classification of
  // the bill as `transfer` is independent and still auto-applies (linkage 1).
  return mk(
    bill,
    windowed,
    fullSum,
    billAbs,
    [`Partial payment: bill ${billAbs} vs cycle total ${fullSum}, residual ${Math.abs(billAbs - fullSum)}`],
    "suggest",
  );
}
```

The critical correctness rule: reconciliation only ever (a) types the bill (and its mirror credit, if present) as `transfer` so it leaves spend, and (b) records an audit link to the cycle's purchases. It never subtracts the bill from the purchases, never deletes a purchase, and never converts a purchase to `transfer`. Partial payments, minimum payments, and installment cards mean the bill rarely equals a clean subset, so we deliberately avoid subset-sum and link to the whole cycle with a residual annotation, leaving the member set in suggest.

#### 5.3 atm_withdrawal

Reuses `isAtmWithdrawal`. An ATM row is a single transaction, not a pair, so it has no candidate-generation step. It is classified by keyword: filed under "Cash & ATM" by default, or flipped to `transfer` when the `treatAtmAsTransfers` setting is on (the existing `orchestrator.ts` behavior, lines 422-431). It enters the scored pipeline only to attach a reason string and a confidence (keyword match = HIGH), so the new event layer can show and undo it like any other classification. No change to the existing setting semantics.

#### 5.4 loan_repayment and investment_transfer

Both are bank-debit to an off-platform or off-budget destination. When the counterpart account is not tracked in Spent (common: a mortgage at another institution, a brokerage), there is no opposite leg to pair, so these are single-row classifications gated on keyword + provider, scored like ATM. When the destination IS tracked (its own credential synced into Spent), they reduce to the 1:1 internal-transfer rule with a `directionMatch` expecting `bank -> investment/loan` account kinds. Following YNAB's budget-boundary rule, a transfer crossing into an UNTRACKED account is the legitimate outflow and may stay categorized (not excluded), whereas a transfer between two tracked owned accounts is excluded; this is a per-event-type policy flag, not new matching logic.

### 6. Confidence scoring

We use a transparent additive log-weight score (Fellegi-Sunter style: per-feature weight `= log2(m/u)`, total weight additive, `P = 2^M / (1 + 2^M)`). Additive weights keep the score explainable, which is mandatory because every auto-decision must be shown to the user and undone. Weights are seeded from the research reference points (weight 4 ~ p 0.94, weight 7 ~ p 0.99), are tunable per event type, and should later be validated against a clerically-labeled sample, never frozen as magic numbers.

```typescript
// src/server/lib/matching/score.ts
import "server-only";

export interface FeatureVector {
  amountExact: boolean;
  amountTolerance: number; // 0..1
  oppositeSign: boolean;
  dateProximity: number; // 0..1
  dateGapDays: number;
  crossAccount: boolean;
  directionMatch: boolean;
  descSim: number; // max(jaroWinkler, tokenSet)
  digitOverlap: boolean;
  keywordTransfer: boolean;
  keywordCardPayment: boolean;
  installmentConsistent: boolean;
  descSemantic?: number; // reserved seam for a future optional embedding signal
}

// Per-event-type weight table (log2 match weights). Positive => evidence FOR a
// link; negative => evidence AGAINST. Seeded, not learned (yet).
const WEIGHTS_INTERNAL_TRANSFER = {
  oppositeSign: 3.0, // structural prerequisite; absence is disqualifying
  crossAccount: 2.5,
  amountExact: 3.0, // exact magnitude is the strongest single signal
  amountToleranceScale: 2.0, // multiplied by amountTolerance when not exact
  dateProximityScale: 2.0, // multiplied by dateProximity
  descStrong: 1.5, // descSim >= 0.90
  descWeak: 0.5, // 0.75 <= descSim < 0.90
  keywordTransfer: 1.5,
  installmentInconsistent: -2.5,
} as const;

export interface ScoreResult {
  weight: number;
  probability: number;
  reasons: string[];
}

export function scoreInternalTransfer(f: FeatureVector): ScoreResult {
  const w = WEIGHTS_INTERNAL_TRANSFER;
  let M = 0;
  const reasons: string[] = [];

  // Structural prerequisites: their absence is disqualifying, not just penalized.
  // Without these the row pair cannot be a transfer regardless of other signals.
  if (!f.oppositeSign) return { weight: -Infinity, probability: 0, reasons: ["Not opposite sign"] };
  if (!f.crossAccount) return { weight: -Infinity, probability: 0, reasons: ["Same account"] };
  M += w.oppositeSign + w.crossAccount;
  reasons.push("Opposite sign", "Different accounts");

  if (f.amountExact) {
    M += w.amountExact;
    reasons.push("Exact amount match");
  } else {
    M += w.amountToleranceScale * f.amountTolerance;
    reasons.push(`Amounts within ${(100 * (1 - f.amountTolerance)).toFixed(1)}%`);
  }

  M += w.dateProximityScale * f.dateProximity;
  reasons.push(f.dateGapDays === 0 ? "Same day" : `${Math.abs(f.dateGapDays)} day gap`);

  if (f.descSim >= 0.9) {
    M += w.descStrong;
    reasons.push("Descriptions strongly match");
  } else if (f.descSim >= 0.75) {
    M += w.descWeak;
    reasons.push("Descriptions partially match");
  }

  if (f.keywordTransfer) {
    M += w.keywordTransfer;
    reasons.push("Transfer keyword present");
  }
  if (!f.installmentConsistent) {
    M += w.installmentInconsistent;
    reasons.push("Installment mismatch");
  }

  const probability = 2 ** M / (1 + 2 ** M);
  return { weight: M, probability, reasons };
}
```

For `credit_card_payment` the same machinery runs with a profile that adds `keywordCardPayment` (+2.0), `directionMatch` bank->card (+2.0), and `digitOverlap` shared last-4 (+2.5), and drops the `keywordTransfer` term. `crossAccount` is still a hard prerequisite. The bill-to-purchases aggregate link (5.2) uses a separate, simpler score: exact cycle-sum match dominates (+4.0), `directionMatch` (+1.5), within-cycle-window (+1.0); a nonzero residual caps the member-set decision at suggest regardless of score.

`oppositeSign` and `crossAccount` are treated as hard prerequisites (return `-Infinity`) rather than large negative penalties, because no accumulation of weak description/date signal should ever drag a same-account or same-sign pair across the auto threshold. This is the safety property that prevents a real expense from being silently merged away.

### 7. Decision: auto-merge / suggest / ignore

Three zones, not one cutoff (Fellegi-Sunter clerical-review band; Plaid's auto-vs-suggest gate). Thresholds are policy choices trading review volume against false merges, and are stored in `settings` so an install can tune them.

| Probability | Weight (approx) | Action |
|---|---|---|
| `>= 0.97` | `>= ~5` | `auto`: create the event, flip member rows to `transfer`, set `needs_review = 0` |
| `0.80 .. 0.97` | `~2 .. 5` | `suggest`: create the event in a proposed state, set `needs_review = 1`, surface in the review queue |
| `< 0.80` | `< ~2` | `ignore`: no event created (still queryable as a near-miss for the manual-match UI) |

Auto-merge is reserved for the high-precision tier (exact amount + tight date + cross-account + opposite sign, optionally a keyword or shared last-4). The middle band (rounded amount, several days apart, partial description match, P2P-looking) always goes to suggest, because amounts and names legitimately drift between pending and posted, and P2P false positives are common. The whole-shekel blocking pass (section 2) is clamped so it can only ever produce suggest or ignore, never auto, regardless of computed probability.

```typescript
// src/server/lib/matching/pipeline.ts (candidate -> score -> decision loop)
export type MatchAction = "auto" | "suggest" | "ignore";

const T_AUTO = 0.97;
const T_SUGGEST = 0.8;

function decide(p: number, blockingPass: "exact" | "shekel"): MatchAction {
  if (blockingPass === "shekel") {
    return p >= T_SUGGEST ? "suggest" : "ignore"; // rounded-amount can never auto
  }
  if (p >= T_AUTO) return "auto";
  if (p >= T_SUGGEST) return "suggest";
  return "ignore";
}

export interface ProposedEvent {
  eventType: EventType;
  memberIds: number[];
  confidence: number;
  reasons: string[];
  action: MatchAction;
}

export function runMatcher(
  workspaceId: number,
  from: string,
  existingMemberIds: ReadonlySet<number>, // members of already-accepted or still-open suggested events
): ProposedEvent[] {
  const proposed: ProposedEvent[] = [];
  // A row joins at most one accepted event. Seed with rows already claimed by a
  // prior sync so re-runs are idempotent and never double-propose the same pair.
  const claimed = new Set<number>(existingMemberIds);

  for (const eventType of EVENT_TYPE_PRIORITY) {
    // cc_payment, internal_transfer, atm, loan/investment
    for (const cand of generateCandidates(workspaceId, from, eventType)) {
      if (cand.memberIds.some((id) => claimed.has(id))) continue;
      const f = buildFeatures(cand, eventType);
      const { probability, reasons } = scoreFor(eventType, f);
      const action = decide(probability, cand.blockingPass);
      if (action === "ignore") continue;

      proposed.push({ eventType, memberIds: cand.memberIds, confidence: probability, reasons, action });
      // Claim only on auto. Suggested pairs do NOT claim, so a stronger CC-payment
      // suggestion later in the same run can still consider the same row; the
      // review layer resolves competing suggestions when the user accepts one.
      if (action === "auto") for (const id of cand.memberIds) claimed.add(id);
    }
  }
  return proposed;
}
```

This greedy, priority-ordered loop preserves the deterministic 1:1 behavior of `findInternalTransferPairs` (closest-date wins, no row reused for an accepted event) while adding scoring and the suggest tier. The `reasons[]` array is persisted on the event so every merge is explainable and the review UI shows "why" without recomputing. Seeding `claimed` with existing event members is what makes a second sync idempotent: a pair already auto-merged or already sitting in the review queue is not re-proposed.

### 8. Outputs and backward compatibility

- The matcher produces proposed events, not row mutations. The event layer, on accept, flips member rows to `kind = 'transfer'` via the existing `markTransfersByIds` / `setTransactionKind` paths, so all current spend/income queries (`getMonthlySummary`, `getCategoryBreakdown`, `getTransactionsSummary`, every `kind = 'expense'` filter) keep working unchanged. The legacy `kind` column stays the source of truth for analytics; events are an additive grouping/audit layer on top.
- Required upstream fix, not optional: `isBankProvider` in `transfers.ts` currently tests a hardcoded two-entry set `new Set(["hapoalim", "leumi"])`, so `detectKind` misclassifies credits and CC payments for every other bank (mizrahi, discount, oneZero, etc.). The matcher's `directionMatch` and CC-payment leg depend on correct `bank` vs `card` typing, so we replace `BANK_PROVIDERS_SET` with a lookup over `BANK_PROVIDERS` (filter `kind === "bank"`) built once at module load. This is a prerequisite migration of logic, not new behavior, and it also makes the existing `detectKind` correct for all banks.
- New exports in `transfers.ts`: `matchesCreditCardPayment(description)` (thin wrapper over the existing private `matchesTransferPattern` / `CREDIT_CARD_PAYMENT_PATTERNS`) so the feature builder reuses the single regex source instead of duplicating it. `matchesInternalTransfer` is already exported and is reused for `keywordTransfer`.
- Reasons and confidence are emitted as data, persisted on the event, never logged (credentials and descriptions must never hit logs per project security rules).
- Reversibility: an event is a link plus a `kind` flip, so undo is "delete event, restore each member's prior `kind`." The pre-merge `kind` of each member is captured on the `event_members` row (schema section) so undo restores the exact prior state, including the case where a member was already `income`, not `expense`. The persisted feature vector explains the original decision.
- The exact-hash dedup (`computeDedupHash`, `dedup_sequence`, the `ON CONFLICT` pending->posted update) is untouched and runs first; the matcher operates strictly on already-deduped, persisted rows. The hash stays over the RAW `description` (normalization is fuzzy-layer only) so exact-dedup behavior is byte-stable across releases. A separate settlement-reconciliation pass (pending->posted, where name/amount may drift) is the natural home for the whole-shekel blocking pass and is cross-referenced from the dedup section rather than duplicated here.

Migration note: all of the above is additive. The expression indexes (`idx_txn_block_amount`, `idx_txn_block_amount_shekel`) and any new columns (persisted `confidence`, `reasons`, per-member pre-merge `kind`) ship in a new migration. The repository's numbering is NOT a clean monotonic sequence (it already contains parallel pairs `020_excluded.sql` + `020_multiple_bank_credentials.sql` and `021_chat_sessions.sql` + `021_reclassify_credit_card_transfers.sql` from merged branches), so the new migration must take the next free index above the highest existing prefix (i.e. `022_event_matching.sql`) and the migration runner must apply files in a total order that tolerates the existing duplicate prefixes. No existing column changes type and no data is rewritten; the expression indexes are `CREATE INDEX IF NOT EXISTS` so re-running the migration is safe.

---

## Database Schema Suggestions (SQLite)

This section gives runnable DDL for the event-grouping layer described elsewhere in this document. It is one additive migration, `022_financial_events.sql`, plus a small TypeScript backfill. The existing runner (`src/server/db/migrate.ts`) picks the file up automatically: it sorts `*.sql` lexically, runs each unapplied file inside one `db.transaction()` with `PRAGMA foreign_keys = OFF`, then runs `PRAGMA foreign_key_check` and aborts the whole migration if any dangling reference remains. Two consequences shape everything below:

- `022` sorts after the two existing `021_*` files (`021_chat_sessions.sql`, `021_reclassify_credit_card_transfers.sql`), so the number is free and ordering is correct.
- Because `foreign_key_check` runs at the end, the migration must not leave a single dangling FK. The DDL below only adds columns and tables and seeds rows that reference already-existing `workspaces`, so it passes. The pair-reconstruction backfill, which is the part most likely to create a bad reference, is deliberately moved out of the SQL and into idempotent TypeScript (see "Backfill").

No table is dropped, no column is removed. The `kind` column and the count-based dedup in `src/server/lib/dedup.ts` stay exactly as they are. The new layer sits beside `kind`, not on top of it.

### Design decision: membership column on `transactions`, not a junction table

The brief asks whether a transaction joins an event through an `event_transactions(event_id, transaction_id, role)` table (many events per txn) or through columns on `transactions` (`event_id`, `event_role`, `match_confidence`, at most one event per txn). Recommendation: columns on `transactions`, one event per transaction.

Rationale grounded in the three linkage problems this design serves (the 1:1 internal-transfer pair, the credit-card bill-payment to N-purchases aggregate link, and the existing `kind`-flip):

- Every real grouping in Spent is a partition, not an overlap. A bank debit is either the funding leg of one transfer or the bill payment for one card statement, never both at once. A card purchase belongs to exactly one billing batch. There is no case where one row legitimately participates in two distinct financial events, so the many-to-many flexibility of a junction table buys nothing and costs an extra join on the hottest analytics path.
- The reporting filter (below) must ask, on every spend query, "is this row the canonical row of its event, or a suppressed member?" With a column that is a single predicate on `t.event_id` plus one correlated lookup; with a junction table it is a join plus a `GROUP BY` just to prove a row has no membership.
- It mirrors what the market leaders ship. Monarch, Copilot, and Simplifi keep the classification on the leg itself (a category or a type), not in a separate pair object. YNAB stores cross-pointers (`transfer_account_id`, `transfer_transaction_id`) but only for the strict 1:1 transfer case, which `financial_events` plus `canonical_transaction_id` already expresses more generally.

The cost is that re-membership (moving a row from event A to event B) is an `UPDATE` of the row rather than a delete-and-insert in a junction. That is fine and is actually easier to make atomic. If a future feature genuinely needs one row in many events (none is on the roadmap), the junction can be added later as another additive migration without disturbing this one.

### Migration `022_financial_events.sql`

```sql
-- 022_financial_events.sql
-- First-class grouping layer over transactions. Generalizes the kind='transfer'
-- flip (007, 008, 021_reclassify_credit_card_transfers) into auditable,
-- reviewable, reversible events. Backward compatible: the kind column is left
-- intact and kept in sync; the existing dedup (src/server/lib/dedup.ts) is
-- untouched. This file is DDL + seed only. No row-pairing logic runs here
-- (it would risk a dangling FK that foreign_key_check would reject); that lives
-- in src/server/db/backfill/022_events.ts.

-- 1. The event: one logical real-world money movement made of N transaction rows.
CREATE TABLE financial_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL
    REFERENCES workspaces(id) ON DELETE CASCADE,

  -- internal_transfer: A->B move between two owned accounts (1:1, two legs).
  -- cc_bill_payment:   one bank debit settling a card statement (1:N to the
  --                    underlying purchases). Today only the bank-side debit
  --                    exists in our data; the mirrored card credit is usually
  --                    NOT scraped, so this event commonly has a single leg.
  -- atm_withdrawal:    cash leaving an account (1:1, or 1:0 when cash untracked).
  -- duplicate:         pending<->posted or re-pull artifact kept as a link, not
  --                    collapsed (see "link, do not collapse" in research).
  event_type TEXT NOT NULL
    CHECK (event_type IN
      ('internal_transfer','cc_bill_payment','atm_withdrawal','duplicate')),

  -- The one row that REPRESENTS this event in reporting, or NULL when the event
  -- contributes nothing to spend. For an internal_transfer that is fully between
  -- owned accounts it is NULL (neither leg is spend). For a cc_bill_payment it
  -- is NULL: the bill itself is not spend, the underlying purchases are.
  -- NOTE: ON DELETE SET NULL means deleting the canonical row makes the event
  -- contribute zero to spend, which is the safe direction (never silently
  -- re-counts), but the review UI must surface "canonical deleted" events.
  canonical_transaction_id INTEGER
    REFERENCES transactions(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','confirmed','dismissed')),

  -- Match probability in [0,1]. REAL is correct here: this is a score, not money.
  confidence REAL NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),

  -- Human-readable, machine-parseable reasons, e.g.
  -- {"amount_delta":0.0,"day_gap":1,"keyword":"\u05d4\u05e2\u05d1\u05e8\u05d4",
  --  "desc_sim":0.94,"comparator":"jaro_winkler"}
  -- JSON1 is compiled into better-sqlite3's bundled SQLite, so json_* work.
  match_reasons TEXT
    CHECK (match_reasons IS NULL OR json_valid(match_reasons)),

  -- Idempotency key: deterministic over the event's defining fields so a re-run
  -- of detection over the same (overlapping) sync window does not create a
  -- second event. Same spirit as dedup_hash. For a transfer, hash the two leg
  -- dedup_hashes in sorted order so leg order does not matter:
  --   sha256("internal_transfer|"+min(hashA,hashB)+"|"+max(hashA,hashB)).
  -- For a cc_bill_payment, hash the bank debit's dedup_hash:
  --   sha256("cc_bill_payment|"+debitDedupHash).
  event_key TEXT NOT NULL,

  source TEXT NOT NULL DEFAULT 'auto'
    CHECK (source IN ('auto','user')),

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (workspace_id, event_key)
);

CREATE INDEX idx_events_workspace_status
  ON financial_events(workspace_id, status);
CREATE INDEX idx_events_workspace_type
  ON financial_events(workspace_id, event_type);
-- Review queue: open, auto-detected, low confidence first.
CREATE INDEX idx_events_review
  ON financial_events(workspace_id, status, confidence)
  WHERE status = 'open' AND source = 'auto';

-- 2. Membership lives on transactions (one event per row, see rationale above).
--    SQLite forbids ADD COLUMN with a REFERENCES clause, so these added columns
--    are plain INTEGER/TEXT. The FK relationship is enforced in the app layer;
--    ON DELETE behavior for event deletion is handled explicitly in the
--    delete/unmerge code path (set event_id = NULL on members first).
ALTER TABLE transactions ADD COLUMN event_id INTEGER;

ALTER TABLE transactions ADD COLUMN event_role TEXT
  CHECK (event_role IS NULL OR event_role IN
    ('transfer_out','transfer_in','bill_payment','bill_item','atm','duplicate_of'));

-- Per-leg score, distinct from the event-level confidence: lets one weak leg be
-- flagged while the event as a whole is confirmed.
ALTER TABLE transactions ADD COLUMN match_confidence REAL
  CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1));

-- The single most important index for analytics: every spend query now also
-- considers event membership. Partial index keeps it tiny (on a fresh install
-- almost no rows have an event).
CREATE INDEX idx_transactions_event
  ON transactions(event_id)
  WHERE event_id IS NOT NULL;

-- 3. The BLOCKING index. This is what keeps detection out of O(n^2). Candidate
--    generation buckets rows by currency + a rounded absolute amount + a day
--    key, so the matcher only compares rows inside one small bucket. abs/round/
--    cast/substr are deterministic, so the expression index is valid.
--
--    CAUTION (read before relying on a single-bucket scan): rounding/truncation
--    is a HARD bucket boundary. Two amounts 0.01 apart can straddle it
--    (199.50 -> 200, 199.49 -> 199 under round; or different days under the
--    date key). The matcher MUST therefore probe the row's own bucket AND the
--    two neighbor amount buckets (b-1, b, b+1) AND every day key inside the
--    rule's day_window, not just the exact bucket. The index makes each of
--    those point lookups O(log n); the exact epsilon test runs afterward on the
--    handful of returned rows. Bucketing on truncated-shekel (CAST AS INTEGER of
--    the absolute amount) gives stable, currency-independent buckets.
CREATE INDEX idx_transactions_block
  ON transactions(
    workspace_id,
    charged_currency,
    CAST(ABS(charged_amount) AS INTEGER),
    substr(date, 1, 10)
  );

-- 4. User-tunable rule params (open-source priority: retune without a code edit).
--    Detection reads these with a hard-coded fallback (see note after the seed)
--    so a workspace created AFTER this migration still has correct defaults.
CREATE TABLE match_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL
    REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN
      ('internal_transfer','cc_bill_payment','atm_withdrawal','duplicate')),
  -- Max allowed |abs(amtA) - abs(amtB)|. Matches DEFAULT_EPSILON = 0.01 in
  -- internal-transfers.ts; surfaced here so it is editable.
  epsilon REAL NOT NULL DEFAULT 0.01,
  -- Max gap in days. Matches DEFAULT_DAY_WINDOW = 2. Tunable per event type;
  -- cc_bill_payment legitimately needs a wider window than a same-bank transfer.
  day_window INTEGER NOT NULL DEFAULT 2,
  -- Auto-confirm at or above auto_score; suggest in [min_score, auto_score);
  -- ignore below min_score.
  min_score REAL NOT NULL DEFAULT 0.5,
  auto_score REAL NOT NULL DEFAULT 0.95,
  -- Require a description keyword on at least one side (today's behavior for
  -- internal transfers). Turn off to rely on amount + date + opposite sign.
  require_keyword INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, event_type)
);

-- Seed defaults per EXISTING workspace so behavior is unchanged on upgrade.
INSERT INTO match_rules (workspace_id, event_type, epsilon, day_window, require_keyword)
SELECT w.id, 'internal_transfer', 0.01, 2, 1 FROM workspaces w;
INSERT INTO match_rules (workspace_id, event_type, epsilon, day_window, require_keyword)
SELECT w.id, 'cc_bill_payment', 0.01, 5, 0 FROM workspaces w;
INSERT INTO match_rules (workspace_id, event_type, epsilon, day_window, require_keyword)
SELECT w.id, 'atm_withdrawal', 0.01, 2, 1 FROM workspaces w;
INSERT INTO match_rules (workspace_id, event_type, epsilon, day_window, require_keyword)
SELECT w.id, 'duplicate', 0.00, 10, 0 FROM workspaces w;

-- 5. Audit table: candidate pairs the scorer considered, kept so a match (and a
--    near-miss) can be explained and reversed. Prune on a schedule.
CREATE TABLE match_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL
    REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN
      ('internal_transfer','cc_bill_payment','atm_withdrawal','duplicate')),
  txn_a_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  txn_b_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  -- Same shape as financial_events.match_reasons.
  reasons TEXT CHECK (reasons IS NULL OR json_valid(reasons)),
  -- Outcome the scorer assigned: above auto_score, in the review band, or below.
  decision TEXT NOT NULL
    CHECK (decision IN ('auto','suggest','reject')),
  -- Set once promoted to a real event; lets us not re-suggest the same pair.
  event_id INTEGER REFERENCES financial_events(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Idempotency: re-running detection over the same window must not pile up
  -- duplicate candidate rows. Order the pair deterministically (min id, max id)
  -- before insert so the unique key is stable.
  UNIQUE (workspace_id, event_type, txn_a_id, txn_b_id)
);
CREATE INDEX idx_candidates_review
  ON match_candidates(workspace_id, decision, score)
  WHERE event_id IS NULL;
```

Two notes on the schema:

- **`event_id` is not a declared FK.** SQLite cannot `ALTER TABLE ... ADD COLUMN ... REFERENCES`. That is why migration 013 recreates whole tables to add FK columns. Recreating `transactions` again (tens of thousands of rows, plus every index) just to make `event_id` a declared FK is not worth it for a self-hosted single file; the relationship is enforced in the app layer, and the unmerge/delete path nulls `event_id` on members before deleting an event so no orphan points at a missing event. If a declared FK is wanted later, fold it into a future recreate.
- **`match_rules` defaults must also exist for workspaces created after this migration.** The seed only covers workspaces that exist at upgrade time. New workspaces will have no `match_rules` rows, so detection must read a rule with a fallback (`SELECT ... ` then `?? HARD_CODED_DEFAULT`), or workspace creation must insert the four default rows. Pick the read-with-fallback path; it is the one that cannot silently disable detection.

A note on the `event_key` UNIQUE constraint: it is the events-layer analogue of `UNIQUE(workspace_id, dedup_hash, dedup_sequence)` on `transactions`. Detection re-runs over an overlapping window (very common: Israeli scrapers re-pull recent history) must be idempotent. Compute `event_key` from the sorted leg `dedup_hash`es (or from the bank-debit `dedup_hash` for a `cc_bill_payment`) and let `INSERT ... ON CONFLICT(workspace_id, event_key) DO UPDATE SET confidence = excluded.confidence, match_reasons = excluded.match_reasons, updated_at = datetime('now')` refresh in place instead of spawning a duplicate, exactly as `insertTransactions` already does for rows. Do NOT key on `transactions.id`: ids are not stable across a re-pull that re-inserts a row, but `dedup_hash` is.

### Backfill from today's `kind`-flipping

Migration `021_reclassify_credit_card_transfers.sql` flipped bank-side credit-card payments to `kind='transfer'` (only for `provider IN ('hapoalim','leumi')`, matching the keyword set in `transfers.ts`), and `findInternalTransferPairs` flips matched 1:1 pairs at sync time. None of that grouped anything. The backfill turns those flags into events without changing any `kind` value, so reporting output is byte-for-byte identical the instant it finishes; the events just make the existing exclusions auditable.

Do the backfill in TypeScript, not SQL, for two concrete reasons:

1. **Correctness of the matcher.** `findInternalTransferPairs` (`src/server/lib/internal-transfers.ts`) filters out `r.kind === "transfer"` on its very first line (`const eligible = rows.filter((r) => r.kind !== "transfer" ...)`). Feeding it the already-flipped `kind='transfer'` rows yields zero pairs. The backfill must pass each leg with a non-transfer `kind` (its pre-flip sign-based kind) so the matcher runs, then write the events for the pairs it returns. A pure-SQL correlated-subquery reconstruction is both fragile (a `MIN(c2.id)` tiebreak can attach the wrong credit when several credits share an amount) and would have to re-implement the keyword and account-difference logic that already lives, tested, in `internal-transfers.ts` and `transfers.ts`. One source of truth wins.
2. **The `foreign_key_check` gate.** A SQL backfill that sets `event_id` while the migration's FK check runs at the end is one typo away from a rejected migration. Keeping pairing out of the SQL keeps `022` trivially safe.

```typescript
// src/server/db/backfill/022_events.ts (sketch)
import "server-only";
import crypto from "node:crypto";
import { findInternalTransferPairs } from "@/server/lib/internal-transfers";

// Load the already-flipped transfer legs, but present each with its SIGN-BASED
// kind so the matcher (which discards kind='transfer') will actually pair them.
const legs = db
  .prepare(
    `SELECT id, credential_id AS credentialId, account_number AS accountNumber,
            date, charged_amount AS chargedAmount,
            charged_currency AS chargedCurrency, description, dedup_hash AS dedupHash
     FROM transactions
     WHERE workspace_id = ? AND kind = 'transfer' AND event_id IS NULL`,
  )
  .all(workspaceId) as Array<{
  id: number;
  credentialId: number | null;
  accountNumber: string;
  date: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  description: string;
  dedupHash: string;
}>;

const byId = new Map(legs.map((l) => [l.id, l]));
const candidates = legs.map((l) => ({
  ...l,
  kind: l.chargedAmount < 0 ? ("expense" as const) : ("income" as const),
}));

const eventKey = (a: string, b: string) =>
  crypto
    .createHash("sha256")
    .update(`internal_transfer|${[a, b].sort().join("|")}`)
    .digest("hex");

const insertEvent = db.prepare(
  `INSERT INTO financial_events
     (workspace_id, event_type, status, confidence, source, event_key, match_reasons)
   VALUES (?, 'internal_transfer', 'confirmed', 1.0, 'auto', ?, json_object('backfill', 1))
   ON CONFLICT(workspace_id, event_key) DO UPDATE SET updated_at = datetime('now')
   RETURNING id`,
);
const attachLeg = db.prepare(
  `UPDATE transactions SET event_id = ?, event_role = ?, match_confidence = 1.0
   WHERE id = ? AND event_id IS NULL`,
);

const run = db.transaction(() => {
  for (const { debitId, creditId } of findInternalTransferPairs(candidates)) {
    const debit = byId.get(debitId);
    const credit = byId.get(creditId);
    if (!debit || !credit) continue;
    const { id } = insertEvent.get(workspaceId, eventKey(debit.dedupHash, credit.dedupHash)) as {
      id: number;
    };
    attachLeg.run(id, "transfer_out", debitId);
    attachLeg.run(id, "transfer_in", creditId);
  }
});
run();
```

The backfill is idempotent: `event_id IS NULL` in the source query and on both `attachLeg` writes means a second run does no extra work, and the `ON CONFLICT(event_key)` makes re-creating an event a no-op refresh.

The bank-side `cc_bill_payment` rows from `021_reclassify_credit_card_transfers.sql` are different: they were flipped to `transfer` but never linked to the card purchases they pay, and the mirrored card credit is usually not in our data at all (we scrape the card's per-purchase rows, not a statement-level credit). Back-fill each such bank debit as a single-leg `cc_bill_payment` event:

```sql
-- Wrap each existing bank-side CC-payment transfer in a cc_bill_payment event.
-- canonical_transaction_id stays NULL: the bill is not spend, the purchases are.
INSERT INTO financial_events
  (workspace_id, event_type, status, confidence, source, event_key, match_reasons)
SELECT t.workspace_id, 'cc_bill_payment', 'confirmed', 1.0, 'auto',
       'cc_bill_payment|' || t.dedup_hash,
       json_object('backfill', 1)
FROM transactions t
WHERE t.kind = 'transfer'
  AND t.provider IN ('hapoalim','leumi')
  AND t.event_id IS NULL
ON CONFLICT (workspace_id, event_key) DO NOTHING;

UPDATE transactions
SET event_id = (SELECT fe.id FROM financial_events fe
                WHERE fe.workspace_id = transactions.workspace_id
                  AND fe.event_key = 'cc_bill_payment|' || transactions.dedup_hash),
    event_role = 'bill_payment'
WHERE kind = 'transfer'
  AND provider IN ('hapoalim','leumi')
  AND event_id IS NULL
  AND EXISTS (SELECT 1 FROM financial_events fe
              WHERE fe.workspace_id = transactions.workspace_id
                AND fe.event_key = 'cc_bill_payment|' || transactions.dedup_hash);
```

This SQL is safe to keep inline only if run AFTER the migration commits (so it is not under the `foreign_key_check` umbrella), or run it from the same `022_events.ts` script. Linking the N underlying purchases to the bill payment (the 1:N aggregate match) is described elsewhere and can be filled in later by a detection pass without changing any total, because the bill payment is already excluded and the purchases are already counted.

One caveat the totals depend on: a bank debit and the bank-side payment row can disagree because Israeli statements sometimes split a single card bill into more than one debit, and `021` flips each matching row independently. The backfill wraps each flipped row in its own `cc_bill_payment` event, which preserves today's exclusion exactly. Merging several debits into one bill event is a later refinement, not a day-one requirement.

### How analytics queries change

Every spend query in `src/server/db/queries/transactions.ts` currently repeats `status = 'completed' AND kind = 'expense'` (in `getMonthlySummary`, `getTopMerchants`, `getCategoryBreakdown`, `getPeriodTotal`, `getTransactionsSummary`, and roughly ten others). That `kind='expense'` predicate already excludes transfers, so those queries keep working unchanged on day one. The events layer adds exactly one more exclusion: a transaction that is a non-canonical member of an event must not be counted, even if its `kind` is still `expense`. To express "count this row in spend exactly once," introduce a view.

```sql
-- Part of migration 022. The canonical "what counts as spend" definition.
-- A row is spendable when it is a completed expense that is EITHER not part of
-- any event, OR is the canonical row of its event. If canonical_transaction_id
-- is NULL the subquery is NULL and t.id = NULL is never true, so a member of a
-- canonical-less event (every internal_transfer and cc_bill_payment today) is
-- correctly excluded. This sums each real expense once; transfers, bill
-- payments, and suppressed duplicates fall out.
CREATE VIEW spendable_transactions AS
SELECT t.*
FROM transactions t
WHERE t.status = 'completed'
  AND t.kind = 'expense'
  AND (
        t.event_id IS NULL
     OR t.id = (SELECT fe.canonical_transaction_id
                FROM financial_events fe WHERE fe.id = t.event_id)
  );
```

The query-layer changes are then mechanical: swap `FROM transactions` for `FROM spendable_transactions` and delete the now-redundant `status = 'completed' AND kind = 'expense'` clauses (keep `workspace_id`, `date`, and any `credential_id` filters, since the view is workspace-agnostic and date-agnostic). For example `getPeriodTotal` becomes:

```sql
SELECT COALESCE(SUM(ABS(charged_amount)), 0) AS total
FROM spendable_transactions
WHERE workspace_id = ? AND date >= ? AND date <= ?;
```

Three details that the migration is responsible for getting right:

- **Do not let the view change any total on day one.** Because the backfill leaves every event with `canonical_transaction_id = NULL`, every currently-excluded row stays excluded and every currently-counted expense (which has no `event_id`) stays counted. The view's output equals the old predicate's output exactly until a future canonical-picking pass runs. That is the property that makes this migration shippable: zero reporting drift on upgrade.
- **Income and the largest-income picker keep the raw table.** `getTransactionsSummary` sums `kind='income'` directly; income's only event interaction is transfers, which `kind` already excludes. If income should later be deduped against events too, add a parallel `countable_income` view with the same canonical rule rather than parameterizing one view, so the planner can use the `kind` index and `idx_transactions_event` cleanly for each.
- **`is_excluded` and excluded merchants are untouched.** The current analytics SUMs do not filter on `is_excluded` (exclusion is applied upstream at categorization time, not netted out of these SUMs), so the view must not add an `is_excluded` predicate either; adding one would silently change historical totals. The view's job is only event-membership, nothing else.

A view in SQLite is a stored SELECT, so the planner still uses `idx_transactions_date`, `idx_transactions_category`, and the new partial `idx_transactions_event`. The correlated `canonical_transaction_id` subquery runs only for the small set of rows that have an `event_id` (the partial index keeps that set tiny), so the common all-rows-have-no-event path that dominates a fresh install does not regress.

`queryTransactions` (the user-facing list, not analytics) should NOT switch to the view: users want to SEE transfer legs and bill payments in the list with an event badge, the way Copilot shows `[T]` and Simplifi shows "Go to other side." Keep that on the raw table and `LEFT JOIN` the event for the badge:

```sql
LEFT JOIN financial_events fe ON t.event_id = fe.id
-- expose fe.event_type, fe.status, t.event_role to the row mapper
```

### SQLite specifics

- **JSON1 for `match_reasons` / `reasons`.** better-sqlite3 bundles SQLite with JSON1 compiled in, so `json_valid()`, `json_object()`, and `json_extract()` work with no extension load. Store reasons as TEXT with a `CHECK(json_valid(...))` guard so a malformed write fails loudly, and read them in the review UI with `json_extract(match_reasons, '$.day_gap')`. Do not normalize reasons into columns; they are explanatory payload, read only on the review screen, and their shape evolves per event type.
- **Partial indexes.** Used deliberately for `idx_transactions_event` (`WHERE event_id IS NOT NULL`), `idx_events_review`, and `idx_candidates_review`. On a typical install almost no rows belong to an event, so each partial index is a fraction of a full one and the hot all-expense scan is untouched. SQLite has supported partial indexes since 3.8.0, far below the bundled version.
- **Expression / blocking index, and the bucket-boundary trap.** `idx_transactions_block` indexes `(workspace_id, charged_currency, CAST(ABS(charged_amount) AS INTEGER), substr(date,1,10))`. The expressions are deterministic (`abs`, `cast`, `substr`), so the index is valid. This index is the single thing that keeps detection off the O(n^2) path: each row is matched only against rows in its bucket. The non-obvious correctness requirement is that bucketing is a hard boundary, so the matcher must NOT scan only the exact bucket. For each row it must probe amount buckets `b-1, b, b+1` and every `substr(date,1,10)` key within the rule's `day_window`, then apply the precise `ABS(ABS(a) - ABS(b)) <= epsilon` and exact day-gap tests on the small returned set. Probing three amount buckets times a few day keys is still a handful of O(log n) point lookups per row, not a scan. For the pending-vs-posted case where amounts can drift more than a shekel, widen the amount-bucket probe in application code rather than coarsening the index.
- **Never compare two amounts with `=`.** `charged_amount` and `original_amount` are REAL in this codebase, inherited as-is; the events layer does not make that worse. Always use the `epsilon` tolerance from `match_rules` (`ABS(ABS(a) - ABS(b)) <= epsilon`), exactly as `findInternalTransferPairs` already does with `DEFAULT_EPSILON = 0.01`. The blocking index's integer-shekel bucket is only for candidate generation; the precise epsilon test runs afterward, so bucketing never causes a false match, only (with the neighbor-bucket probe) avoids a missed one. `confidence`, `match_confidence`, `score`, `min_score`, and `auto_score` are scores, not money, so REAL is correct and intended for them; their `CHECK (… BETWEEN 0 AND 1)` guards catch a bad write.
- **Sign convention is load-bearing in detection.** `charged_amount` is NEGATIVE for debits/expenses and POSITIVE for credits/income. A transfer pair is one negative leg and one positive leg with equal absolute value; the matcher must compare `ABS()` and require opposite raw signs, which `findInternalTransferPairs` already does (`debits = ... < 0`, `credits = ... > 0`). When choosing a `canonical_transaction_id` for an event that does cross the budget boundary, pick the leg whose sign matches the direction being counted (the expense leg for spend), never the absolute-larger leg.
- **Hebrew / RTL in keys and matching.** `event_key` and `dedup_hash` are SHA-256 hex, so RTL text in descriptions never reaches a key; do not put raw descriptions in `event_key`. Description-based matching stays keyword-driven via the tested regexes in `transfers.ts` (which already handle the Hebrew CC and `\u05d4\u05e2\u05d1\u05e8\u05d4`/transfer forms and the final-letter variants). Note the current keyword set fires only for `provider IN ('hapoalim','leumi')` (`BANK_PROVIDERS_SET`), so cc_bill_payment detection is presently scoped to those two banks; widening it to the other banks in `BANK_PROVIDERS` is a `transfers.ts` change, not a schema change, and `require_keyword` plus `match_rules` let a self-hoster opt other providers in.
- **FTS5 for fuzzy description matching (optional, not in `022`).** Hebrew RTL descriptions defeat Soundex/Metaphone (English-pronunciation bound) and are awkward for edit distance. If fuzzy scoring becomes necessary, the lightweight option is an FTS5 contentless/external-content table over a normalized description (strip RTL marks and niqqud, unify final-letter forms) used purely as a candidate-generation blocker, then score the short list with Damerau-Levenshtein or token-set Jaccard in TypeScript. better-sqlite3 ships FTS5, but keep it out of the core migration: amount-plus-date blocking does the heavy lifting and description similarity is only one feature in the score, per record-linkage guidance to use exact comparators on high-signal fields and reserve fuzzy logic for free text.

### Why this generalizes the current code rather than replacing it

`kind` stays authoritative for the coarse "exclude from spend/income" decision, so nothing in the existing query layer breaks on day one, and the new view reproduces today's totals exactly until a canonical-picking pass runs. `financial_events` adds the three things the current flags cannot express: the grouping (which rows form one event, via `event_id`/`event_role`), the provenance (`source`, `confidence`, `match_reasons`, `match_candidates`), and the workflow (`status` open/confirmed/dismissed plus a reversible `event_id` that can be nulled to unmerge). `detectKind` and `findInternalTransferPairs` keep running at sync time; their output becomes the seed for events (high confidence, auto-confirmed) instead of a terminal flag, and `match_rules` lets a self-hosting user retune `epsilon`, `day_window`, `require_keyword`, and the auto-versus-suggest thresholds without editing the constants in `internal-transfers.ts`.

---

## Edge Cases and Failure Scenarios

This section enumerates the concrete ways the event-grouping layer can go wrong, the failure mode of each, and an implementation-ready mitigation. The cardinal rule, applied everywhere, is the **no-auto-hide bias**: when the engine is not confident, it must NOT flip a row to `kind='transfer'` (the ONLY flag that today removes a row from both spend and income analytics). It must instead leave the row's `kind` untouched and write a *suggestion* into the new `financial_events` / `event_links` tables with `status='suggested'` and `needs_review=1`, so a real expense can never disappear without a human confirming it.

### Ground-truth correction: what actually excludes a row from analytics

Every spend query in `transactions.ts` (`getMonthlySummary`, `getTopMerchants`, `getCategoryBreakdown`, `getCategorySpendInRange`, `getTopMerchantPerCategory`, `getCategorySpendByDay`, `getTopMerchantsForCategory`, `getPeriodTotal`, `getPeriodCount`, the expense/income aggregates in `getTransactionsSummary`) filters on `kind` plus `status='completed'`. **None of them filter on `is_excluded`.** The `is_excluded` column (migration `020_excluded.sql`) is driven only by the `excluded_merchants` "hide this merchant" feature and the per-row "Hide / Show" toggle; it is surfaced in `mapTransactionRow` for the UI but it does NOT subtract a row from any aggregate today. Therefore:

- The single load-bearing exclusion mechanism for this design is `kind='transfer'`. The earlier draft's repeated phrasing "excluded by `kind`/`is_excluded`" is wrong and is corrected throughout to "excluded by `kind='transfer'`."
- This design does NOT repurpose `is_excluded`. If a future change wants `is_excluded` to also drop rows from spend, that is a separate, explicit migration that must add `AND is_excluded = 0` to all ten queries above; until then, setting `is_excluded` alone hides nothing from totals and is unsafe to rely on for double-count prevention.

The new `financial_events.status` and `event_links` are audit/UX state; the actual analytics effect of any decision is realized solely by writing `kind` (and, for AUTO, clearing `needs_review`). This keeps the design backward compatible with the existing `detectKind` + `markTransfersByIds` orchestrator passes, which are the AUTO tier of the new engine.

### Provider-set reality (constrains every cc-payment claim below)

`isBankProvider` in `transfers.ts` returns true for EXACTLY `hapoalim` and `leumi` (`BANK_PROVIDERS_SET`). `detectKind`'s cc-payment flip and its `chargedAmount > 0 -> income` flip therefore only fire for those two providers; the reclassify migration `021` likewise hardcodes `provider IN ('hapoalim','leumi')`. Consequences the design must own:

- A credit-card bill debited from Mizrahi, Discount, or One Zero checking is currently classified `expense` and is NOT auto-flipped, so it can double-count against synced card purchases. Adding banks to `BANK_PROVIDERS_SET` (and to `021`'s provider list, or better, replacing `021`'s inline LIKE list with a re-run of `detectKind`) is a prerequisite for the cc-payment AUTO path to be correct for those banks. Until a provider is in the bank set, its cc-payment rows fall to the SUGGEST path, never AUTO.
- All cc-payment claims below are scoped to "provider is in the recognized bank set." For unrecognized-bank providers, the engine emits a SUGGEST with `needs_review=1` rather than silently doing nothing or silently hiding.

### Confidence tiers (referenced throughout)

Every candidate group carries a `confidence` in `[0,1]` (Fellegi-Sunter three-zone policy) and resolves to one action:

| Tier | Score | Action | Schema effect |
| --- | --- | --- | --- |
| AUTO | `>= 0.97` | Group + flip all legs to transfer | `financial_events.status='confirmed'`, legs `kind='transfer'`, `needs_review=0` |
| SUGGEST | `0.80 - 0.969` | Group as proposal, legs keep `kind` | `status='suggested'`, legs unchanged `kind`, `needs_review=1` |
| IGNORE | `< 0.80` | Do nothing | no event row |

AUTO is reachable only by (a) the cc-payment keyword path for a recognized bank provider, gated on a tracked card (case 5), and (b) exact same-currency, same-amount, opposite-sign internal-transfer keyword pairs (case 8). Pure fuzzy or amount-only matches cap in SUGGEST. This preserves the current `detectKind` flip as AUTO and makes everything new suggest-first.

### 1. Partial, over, and minimum credit-card payments

**Failure mode.** The bank-side debit (one row, `-1,200`) does not equal the sum of the card-account purchases (`-3,800` of line items). A 1:1 amount matcher never pairs them; a matcher that nets payment against purchases would erase `2,600` of real spend on an under-payment, or invent negative spend on an over-payment.

**Mitigation.** Never net the payment against the purchases. Spend is counted once at purchase time; the bill payment is pure money movement. The `type='cc_payment'` event links only money-movement legs and does NOT require amounts to reconcile:

- `role='cc_payment_bank_leg'`: the checking debit (recognized bank provider). Flipped to `kind='transfer'`.
- `role='cc_payment_card_leg'`: the credit posted on the card account, if that account is synced. Flipped to `kind='transfer'`.
- The underlying card purchases are NOT linked; they stay `kind='expense'` and remain the single source of spend.

Minimum, full, and over-payment are identical to the engine: it transfers the money-movement legs and leaves purchases untouched. The revolving balance is a liability concern, out of scope for spend analytics. No amount tolerance exists on the bill relationship because we deliberately do not assert `payment == sum(purchases)`.

### 2. One bank payment covering multiple cards; one card paid from multiple banks

**Failure mode.** A `-5,000` bank debit settles three cards. The keyword path flips the one bank row fine, but a 1:1 card-side pairing would pick one card and leave two card credits as un-flipped `income` (double-counted inflow). Mirror case: one card paid from two banks yields two bank debits each looking like a partial payment.

**Mitigation.** The model is N:M by construction (a join table, not a paired FK). The bank leg joins one `cc_payment` event; each card-side credit is a separate `cc_payment_card_leg` in the *same* event. Detection is per-leg, not per-pair: each card-side "payment received" credit is flipped to transfer independently by a per-provider rule set, so an unmatched card credit never counts as income.

Note the current code cannot do this yet: `detectKind`'s income flip only runs for `hapoalim`/`leumi`, and card providers (isracard, cal, max, amex) get `kind='expense'` regardless of sign, so a `+5,000` "payment received" credit on a card account is currently mislabeled `expense` with a positive amount. Because spend queries `SUM(ABS(charged_amount))` over `kind='expense'`, that positive credit is wrongly summed as `5,000` of spend. The fix is a card-side "payment received" rule that flips these specific credits to `kind='transfer'`:

```typescript
// Per-provider card-side "payment received" patterns (Hebrew + English).
// Examples seen on card statements: "תשלום שהתקבל", "זיכוי", "PAYMENT RECEIVED", "PAYMENT - THANK YOU"
const CARD_PAYMENT_RECEIVED_PATTERNS: readonly RegExp[] = [
  /תשלום\s*שהתקבל/i,
  /פירעון/i,
  /\bPAYMENT\s+RECEIVED\b/i,
  /\bPAYMENT\b.*\bTHANK\s*YOU\b/i,
];
```

Only credits (`charged_amount > 0`) on a card credential whose description matches are flipped; a positive card row that does NOT match is a refund (case 10), not a payment. The grouping into one event is audit/UX only; an incomplete grouping degrades to "each leg still correctly flipped," not "money reappears."

### 3. Cross-currency (FX) and rounding/agorot

**Failure mode.** A `-100` USD transfer lands as `+372.40` ILS (rate plus fee). `findInternalTransferPairs` requires `sameCurrency` AND `|amtA-amtB| <= 0.01`, so it correctly refuses to pair these, but a genuine FX self-transfer then stays counted on both sides. Separately, agorot rounding (`-99.99` vs `+100.00`) exceeds `epsilon=0.01`.

**Mitigation.**

- **Same-currency rounding:** keep `DEFAULT_EPSILON = 0.01`. This absorbs agorot. Do not widen it for same-currency: `0.01` ILS is the smallest real unit and widening invites case-8 false positives.
- **Cross-currency:** a separate, SUGGEST-only FX matcher that is self-disabling when no rate source is configured (this is a local-only app; we do not require a network call). It compares `original_amount`/`original_currency` of one leg against `charged_amount`/`charged_currency` of the other:

```typescript
const FX_FEE_TOLERANCE = 0.03; // 3% absorbs spread + conversion fee

// rate: mid-market units of b.currency per unit of a.originalCurrency, or null
// if no rate source is configured. Null -> matcher does not run (no-auto-hide).
function isFxTransferCandidate(a: TransferCandidate, b: TransferCandidate, rate: number | null): boolean {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return false;
  const expected = Math.abs(a.originalAmount) * rate;
  if (expected <= 0) return false;
  const actual = Math.abs(b.chargedAmount);
  return Math.abs(actual - expected) / expected <= FX_FEE_TOLERANCE;
}
```

An FX match can never reach AUTO; it caps at `0.90` (SUGGEST). The user confirms. Note `TransferCandidate` today only carries `chargedAmount`/`chargedCurrency`; the candidate query (`getInternalTransferCandidates`) must be widened to also select `original_amount`/`original_currency` for this path. Store the implied rate and tolerance in `match_reasons` so the suggestion is explainable.

### 4. Statement-cycle timing and history-window cutoffs

**Failure mode.** Purchases happen in cycle N; the bill debits in month N+1, 30 to 45 days after the earliest purchase, far beyond the 2-day `DEFAULT_DAY_WINDOW`. With Yahav's 6-month limit (and configurable `months_to_sync`, default 3), the bank debit can be inside the sync window while the matching card credit or purchases fall outside it, or vice versa. `getInternalTransferCandidates(workspaceId, from)` filters `date >= from`, so a window-bounded query misses the relationship.

**Mitigation.**

- The cc-payment bank leg is flipped by the **keyword path**, which is window-independent: it runs at insert in `detectKind` and in migration `021`. Cycle lag never reintroduces double counting for the bank leg; it is flipped the moment it is seen, whether or not the card side has synced.
- For non-CC internal transfers, widen the candidate window asymmetrically (transfers usually settle a few days later, not earlier). Make it tunable in `workspace_settings` (default conservative):

```typescript
const TRANSFER_LOOKBACK_DAYS = 3;
const TRANSFER_LOOKAHEAD_DAYS = 5;
// candidate query lower bound becomes date(from, '-3 days'); upper bound is open.
```

- For the history-window edge (one leg outside the synced range), the engine treats a single observed leg as case 5: it does not auto-hide. A bank debit whose card account is unsynced stays flipped via keyword only if a card is tracked (case 5); a transfer leg whose counterpart is outside the window stays counted, un-grouped. The user sees one real movement, never a silently-vanished half-transfer.

### 5. Only one leg synced (the most dangerous case: hiding real spend)

**Failure mode.** The user connects their bank but not their credit card. The bank shows a `-1,200` "ויזה" debit. Today `detectKind` flips it to `transfer` unconditionally for `hapoalim`/`leumi`, so a user who does NOT track that card sees `1,200` of real spending vanish, with no card-side purchases to replace it.

**Mitigation.** This is where Spent must diverge from the current blind keyword flip. The cc-payment flip is only *safe* when the card's purchases exist somewhere in the workspace. Gate the AUTO flip on "is any credit-card credential connected in this workspace?":

```typescript
function shouldAutoFlipCcPayment(workspaceId: number): boolean {
  // AUTO only when the workspace tracks at least one card provider, so the
  // purchases that replace this payment as spend actually exist.
  return countCardCredentials(workspaceId) > 0;
}
```

- Card IS tracked: keyword cc-payment legs go AUTO (`kind='transfer'`, `needs_review=0`).
- NO card tracked: the bank "ויזה" debit stays `kind='expense'`, tagged `needs_review=1`, with a suggestion "Looks like a credit-card bill. Connect that card to avoid double counting, or mark this as a transfer." The money stays visible.

This is a behavioral change to today's `detectKind`, which currently flips unconditionally. Because `detectKind` runs at insert time and has no DB access, the gate cannot live inside `detectKind`; it must run as a post-insert pass in the orchestrator (alongside `findInternalTransferPairs`) that flips cc-payment expense rows to transfer only when `shouldAutoFlipCcPayment` is true, and otherwise sets `needs_review=1`. The migration `021` reclassify must be similarly gated, or it will retroactively hide bills for card-less workspaces.

For ordinary internal transfers, a lone leg never pairs (the matcher needs two opposite-sign rows in different accounts), so it simply stays counted, which is the safe default.

### 6. Re-sync re-matching, and pending->posted with changed amounts

**Failure mode.** A pending row and its posted version may differ in name and amount (tip added, auth hold released). `dedup_hash` includes `description` and `originalAmount`, so a posted row with a changed amount gets a *different* hash and inserts as a NEW row; the `ON CONFLICT(... ) DO UPDATE ... WHEN status='pending'` upgrade never fires. That double-counts the charge and orphans any event link pointing at the now-stale pending row.

**Mitigation.**

- A **settlement-reconciliation pass** runs after insert and before transfer detection. It retires a pending row when a posted row arrives for the same logical charge within a small window, tolerating drift on noisy fields and blocking on high-signal ones:

```sql
SELECT p.id AS pending_id, q.id AS posted_id
FROM transactions p
JOIN transactions q
  ON q.workspace_id = p.workspace_id
 AND q.account_number = p.account_number
 AND q.status = 'completed' AND p.status = 'pending'
 AND (q.charged_amount < 0) = (p.charged_amount < 0)          -- same sign
 AND ABS(julianday(substr(q.date,1,10)) - julianday(substr(p.date,1,10))) <= 5
 AND ABS(ABS(q.charged_amount) - ABS(p.charged_amount)) <= 0.20 * ABS(p.charged_amount)
WHERE p.workspace_id = ?
```

`julianday` and `substr` are core SQLite/better-sqlite3 functions, safe here. Resolve each pending to at most one posted (closest amount, then closest date). Tombstone the pending (do not hard-delete): add a `superseded_by INTEGER REFERENCES transactions(id)` column so undo can restore it and event links can re-home. Analytics must additionally filter `superseded_by IS NULL` (a new `AND` on the same ten queries) so a tombstoned pending is not counted; this is an explicit, additive part of this migration, not a free side effect. Drift beyond 20% does not auto-merge; it surfaces as a manual-dedup suggestion.

- **Idempotent re-matching.** The detector is safe to run every sync: it only reconsiders `status='suggested'` events and un-grouped, non-locked rows. Before creating any suggestion it checks the override log (case 7); confirmed events are never recomputed.

### 7. User manual override conflicts (engine must respect user decisions permanently)

**Failure mode.** The user un-merges an engine event, or sets a `transfer` back to `expense` via `setTransactionKind`. Next sync, the deterministic detector re-runs and re-hides the row. `batchUpdateCategories` already guards `category_source IS NOT 'user'`, but there is NO equivalent guard on `kind`: the `ON CONFLICT` clause hardcodes `kind = transactions.kind` (preserving kind on re-insert, good), yet the post-sync `markTransfersByIds` pass will happily overwrite a user's manual un-transfer, and the gated cc-payment pass would re-flip it.

**Mitigation.** A durable, append-only `user_overrides` table keyed by a **stable fingerprint**, not the autoincrement `id` (which changes when a pending row is tombstoned in case 6). Use `(workspace_id, dedup_hash, dedup_sequence)`, the natural key that survives re-sync:

```sql
CREATE TABLE user_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dedup_hash TEXT NOT NULL,
  dedup_sequence INTEGER NOT NULL,
  field TEXT NOT NULL CHECK(field IN ('kind','event_membership')),
  decided_value TEXT NOT NULL,         -- e.g. 'expense', or 'unlinked'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, dedup_hash, dedup_sequence, field)
);
CREATE INDEX idx_user_overrides_lookup ON user_overrides(workspace_id, dedup_hash, dedup_sequence);
```

The detector loads the override set once per workspace per sync (one query, O(overrides), not per-row), and treats it as a hard skip-list:

```typescript
const overrideSet = loadKindOverrides(workspaceId); // Set<`${dedupHash}:${dedupSequence}`>
function isLocked(c: { dedupHash: string; dedupSequence: number }): boolean {
  return overrideSet.has(`${c.dedupHash}:${c.dedupSequence}`);
}
const eligible = candidates.filter((c) => !isLocked(c));
```

This requires extending `TransferCandidate` and `getInternalTransferCandidates` to also select `dedup_hash`/`dedup_sequence` (today they select only `id`). Every code path that writes `kind` from the engine (`markTransfersByIds`, the cc-payment pass, ATM-transfer pass) must filter out locked rows first. The override is permanent and survives DB compaction because it is data, not state. Optionally offer to promote an override into a reusable normalized-description rule (handled in the rules section).

### 8. False positives: two unrelated equal-amount, same-day transactions

**Failure mode.** A `-50.00` coffee on a card and a `-50.00` standing order on the bank, same day. A pure amount+date matcher pairs and hides both, erasing `100` of real spend. `findInternalTransferPairs` is exactly this matcher, saved today only by its `matchesInternalTransfer` keyword guard (lines 99-104).

**Mitigation.** Keep the **keyword-on-at-least-one-side requirement** as a hard precondition for any internal-transfer auto-grouping. Amount+date+sign alone never reaches even SUGGEST:

```typescript
let score = 0;
if (exactAmountSameCurrency) score += 0.45;
if (oppositeSignDifferentAccount) score += 0.20;
if (dayGap <= TRANSFER_LOOKAHEAD_DAYS) score += 0.10;
if (matchesInternalTransfer(a.description) || matchesInternalTransfer(b.description)) score += 0.30;
const confidence = Math.min(score, 1);
// no keyword: 0.75 -> below 0.80 floor -> IGNORED
// with keyword + exact same-currency amount + sign + window: clamps to 1.0 -> AUTO eligible
```

Without a transfer keyword, two equal same-day rows score `0.75` and are ignored, so unrelated charges stay counted. Same-account same-sign equal amounts are dedup candidates (handled by `dedup_hash`/`dedup_sequence`), never routed to the transfer matcher; the matcher already filters to opposite signs and different accounts.

Hebrew/RTL note: `matchesInternalTransfer` normalizes whitespace (`replace(/\s+/g, " ").trim()`) but does NOT strip RTL/LTR control marks (`\u200e`, `\u200f`) or normalize the maqaf (`־`, `\u05be`) versus ASCII hyphen that Israeli statements mix freely. The internal-transfer set (`העברה`, `העברת`) should add the geresh/quote variants and tolerate an embedded bidi mark, mirroring how `CREDIT_CARD_PAYMENT_PATTERNS` already handles `ישרא[\s־-]?כארד`. Without this, a transfer labeled `"העברה\u200f"` fails to match and stays double-counted (a no-auto-hide-safe failure, but a missed legitimate exclusion).

### 9. Installments versus lump sum

**Failure mode.** An Isracard installment purchase (`type='installments'`) posts as N rows over N months while the bank may show the full lump-sum charge or N monthly debits. A matcher could pair one installment leg against the lump-sum debit and hide a real installment, or try to re-sum installments against the bill.

**Mitigation.** Installment rows are spend and stay spend; they are purchases, never money movements, so they are never transfer-grouped. `dedup_hash` already includes `installmentNumber` + `installmentTotal`, so the N rows are distinct and individually counted (correct: each month's installment is that month's spend). The bank-side bill is flipped by the cc-payment keyword path (case 1), with no attempt to reconcile installment counts against the bill. Add an explicit guard so installment rows are never offered as transfer legs (note `type` is not currently on `TransferCandidate` and must be added to the candidate query):

```typescript
const eligible = rows.filter(
  (r) => r.kind !== "transfer" && r.chargedAmount !== 0 && r.type !== "installments",
);
```

### 10. Refunds, chargebacks, reversals

**Failure mode.** A refund is a positive `charged_amount` on a card account; a reversal is a positive row on a bank account. The internal-transfer matcher could pair a refund with an unrelated same-amount debit and hide a real expense. `detectKind`'s `chargedAmount > 0 -> income` flip applies only to `hapoalim`/`leumi`, so a bank reversal can be mislabeled `income`.

**Mitigation.**

- A card-account positive row that does NOT match `CARD_PAYMENT_RECEIVED_PATTERNS` (case 2) is a refund: keep it `kind='expense'` with positive `charged_amount`. The card-provider branch of `detectKind` already leaves card rows as `expense` (the income flip is bank-only), so a refund on Isracard stays `expense`. Caveat: the category-level analytics use `SUM(ABS(charged_amount))`, which counts a `+200` refund as `+200` of spend, NOT as a `-200` offset. Truly netting a refund against its original charge requires either signed sums in the per-category queries or an explicit `reversal` event that flips both legs out of spend. This design chooses the explicit `reversal` event (below) so the existing `ABS` queries stay untouched and net-zero is achieved by excluding both legs, not by mixing signs.
- Refunds are excluded from transfer-candidate generation unless they carry a transfer keyword. Link a refund only to its original charge as a same-account, same-`identifier`, opposite-sign reversal (`type='reversal'`), never as a cross-account transfer:

```sql
-- reversal candidates: same workspace + account, opposite sign, shared identifier
WHERE a.workspace_id = b.workspace_id
  AND a.account_number = b.account_number
  AND a.identifier IS NOT NULL AND a.identifier = b.identifier
  AND ABS(ABS(a.charged_amount) - ABS(b.charged_amount)) <= 0.01
  AND (a.charged_amount < 0) <> (b.charged_amount < 0)
```

Use `ABS` difference within epsilon rather than `a.charged_amount = -b.charged_amount` (exact float equality on `REAL` columns is unreliable). `identifier` is "not reliably unique across banks" per the known quirks, but same-account same-identifier opposite-sign within the window is a strong reversal signal; matched pairs flip both to `kind='transfer'` with `match_reasons` recording the shared identifier. When `identifier` is null, do not auto-link; SUGGEST instead.

### 11. Deleting a bank credential an event depends on

**Failure mode.** The user removes a `bank_credentials` row. If transactions cascade-delete with the credential, all that account's history vanishes and orphans `event_links`. A cc-payment event could lose its bank leg, leaving a flipped card-side credit with no explanation.

**Mitigation, with a caveat the design must resolve first.** The grounding header lists `credential_id` on `transactions`, and `mapTransactionRow` reads `r.credential_id` and `queryTransactions` LEFT JOINs `bank_credentials` on `t.credential_id`. However, the `013_workspaces.sql` transactions recreate does NOT include a `credential_id` column, so this column is added by a later migration in the chain (the multiple-credentials work, `020_multiple_bank_credentials.sql`) and its FK on-delete behavior must be confirmed before relying on it. The required behavior:

- `transactions.credential_id` must be `ON DELETE SET NULL` (NOT cascade), so deleting a credential preserves history. `mapTransactionRow` already tolerates null (`r.credential_id ?? null`) and `queryTransactions` LEFT JOINs, so a null link renders fine.
- `event_links.transaction_id` and `financial_events` are CASCADE toward `transactions` (so deleting a transaction cleans its links), but since transactions are NOT deleted on credential removal, links survive too.
- On credential delete, run an event-integrity pass: any `financial_event` that loses a required leg is downgraded `confirmed -> needs_review` (not deleted). A cc-payment card-leg whose bank leg is gone but whose card purchases remain stays flipped (purchases are still the spend source). Surface "an account this group referenced was removed" in review.

If the actual FK turns out to be cascade, this design is blocked until it is changed to SET NULL via a table recreate (SQLite cannot ALTER an FK in place; follow the `013` recreate pattern).

### 12. Many identical-amount transfers same day (greedy mispairing + O(n^2))

**Failure mode.** Three `-1,000` transfers between the same two accounts on the same day. The greedy `for (debit) { pick closest credit }` in `findInternalTransferPairs` can pair across the wrong triple, and crucially can pull in an *unrelated* same-amount row in a *third* account and hide a real expense. Separately, the current matcher is O(debits x credits) per candidate set; on a wide window with many same-amount rows this is a real quadratic trap.

**Mitigation.**

- Replace the nested scan with **hash-bucket blocking**: group candidates by unordered account-pair + rounded amount + day, then pair only within a block. This removes the cross-account false pairing AND collapses the quadratic to near-linear (each row hashes into one bucket; buckets are small):

```typescript
const blockKey = (a: TransferCandidate, b: TransferCandidate) =>
  [a.accountNumber, b.accountNumber].sort().join("|") +
  `:${Math.abs(a.chargedAmount).toFixed(2)}:${a.date.slice(0, 10)}`;
```

In practice you bucket each row once by `(amount.toFixed(2), date)` and only compare debits to credits sharing that bucket and a different account, never scanning all credits for every debit.

- Within a block, require **balanced cardinality** before AUTO: only AUTO-flip when the block has equal numbers of debits and credits between exactly two accounts (a clean 3-out/3-in, all interchangeable, so mispairing among them is harmless because every leg is flipped regardless). An unbalanced block (3 debits, 1 credit, suggesting a real third-account charge leaked in) drops to SUGGEST and asks the user. Optimal min-cost (Hungarian) matching is unnecessary for interchangeable equal amounts and is not worth the complexity here.

### 13. Self-transfers within one bank across sub-accounts

**Failure mode.** A move from checking to savings under the same `credential_id` (one Hapoalim login, two account numbers). `isDifferentAccount` returns true on differing `accountNumber`, which is correct. The inverse risk: some providers reuse or omit `account_number`, so two genuinely different sub-accounts can share an `account_number` (then `isDifferentAccount` returns false and the self-transfer stays double-counted), or a provider returns one `account_number` for the whole login (intra-login transfers invisible).

**Mitigation.**

- `isDifferentAccount` is correct as a *necessary* condition. Harden it: two rows are the same account only when BOTH `credential_id` and `account_number` match. When `account_number` collides but the rows are clearly two sub-accounts and the scraper exposes a sub-account list, use it to disambiguate. Where the scraper cannot disambiguate, the safe behavior is to NOT auto-pair (leave both counted) and SUGGEST, never to risk hiding a real expense on a shared account number.
- Same-`credential_id`, cross-`account_number` transfers are the cleanest case (same owner) and may reach AUTO when they also carry an internal-transfer keyword and an exact same-currency, same-amount, opposite-sign match within the window. Self-transfers never carry a credit-card-payment keyword, so they go through the internal-transfer path, not the cc-payment path, and are correctly excluded from both spend and income.

### Cross-cutting invariants

1. **Excluding is per-leg via `kind='transfer'`, never per-pair, and never via `is_excluded`** (which today subtracts nothing from totals). An incomplete or wrong grouping degrades to "each leg still correctly flipped or still correctly counted," never "money reappears or vanishes."
2. **No-auto-hide.** Only (a) the cc-payment keyword path for a recognized bank provider AND gated on a tracked card, and (b) exact same-currency internal-transfer keyword pairs, reach AUTO. Everything fuzzy is SUGGEST with `needs_review=1`; the row stays in analytics until a human confirms. This is a deliberate, behavior-changing tightening of today's unconditional `detectKind` cc-payment flip.
3. **Every auto decision is explainable and reversible.** Persist the comparison vector and feature weights in `financial_events.match_reasons` (JSON text column; better-sqlite3 has no native JSON type, store stringified and parse in app code, or use SQLite's `json_*` functions for queries). Unlink is a delete of `event_links` rows plus a `user_overrides` entry, plus reverting `kind` on the affected legs; it never mutates amounts.
4. **User decisions are permanent and survive re-sync** via `user_overrides` keyed on `(workspace_id, dedup_hash, dedup_sequence)`, loaded once per sync as a hard skip-list and consulted before every engine write to `kind`.
5. **Backward compatible and additive.** New tables (`financial_events`, `event_links`, `user_overrides`), a new `superseded_by` column with the matching `AND superseded_by IS NULL` added to the ten analytics queries, plus the existing `kind` column. No destructive change. The current `detectKind` + `findInternalTransferPairs` + `markTransfersByIds` orchestrator passes become the AUTO tier, now gated (case 5) and override-aware (case 7). Where a behavior depends on a fact not yet true in the codebase (banks beyond `hapoalim`/`leumi` in `BANK_PROVIDERS_SET`; `credential_id` FK being `ON DELETE SET NULL`), that prerequisite is called out at the point of use and must be landed before the dependent AUTO behavior is enabled.

---

## UX Recommendations for Merged Transactions

This section specifies the user-facing surface for the FinancialEvent grouping layer defined elsewhere in this document. Everything here is additive over the current `transactions-table.tsx`. It reuses the existing `Badge`, `DropdownMenu`, `Card`, `Switch`, `Select`, and `SettingCard` primitives, and it never deletes or hard-mutates a scraped row: an event is a separate link layer that annotates rows, so the existing exact dedup (`UNIQUE(workspace_id, dedup_hash, dedup_sequence)`) and the `kind` column stay authoritative and re-sync stays idempotent.

The single non-negotiable principle (Monarch, Copilot, YNAB, Simplifi alike): **never silently hide money, always show the trail, always make it reversible.** Spending math already drops `kind='transfer'`; the moment we group rows, the user must see exactly which rows were grouped, why, and be able to undo it in one click.

One grounding correction that shapes the whole UX: today only `hapoalim` and `leumi` are in `BANK_PROVIDERS_SET` (verified in `src/server/lib/transfers.ts` line 7), so `detectKind`'s card-payment and bank-income branches only fire for those two providers. Card payments from other banks (mizrahi, discount, oneZero, etc.) are currently mis-filed as `expense` and double-counted. The event layer must therefore be the *general* fix and the UI must not assume a row already carries `kind='transfer'` just because it is the bank side of a card bill. The migration that widens the provider set and the matcher that scores these events are specified in the data-model section; this section consumes their outputs.

### Shared assumptions about the data shape this UX consumes

The list endpoint (`GET /api/transactions`) returns, per row, an optional event envelope. The UX only needs these fields (names match the migration columns proposed in the data-model section):

```ts
// extends TransactionWithCategory in src/lib/types.ts
interface FinancialEventRef {
  eventId: number;
  eventType: "internal_transfer" | "card_payment" | "atm" | "manual";
  // role of THIS row within the event:
  //  representative = the row shown in the ledger
  //  leg           = a participating side (transfer/atm legs)
  //  underlying    = a card purchase sitting behind a bill
  role: "representative" | "leg" | "underlying";
  status: "auto_confirmed" | "suggested" | "user_confirmed" | "user_rejected";
  // Fellegi-Sunter total match weight; null for user-created merges (no score).
  matchWeight: number | null;
  // i18n keys + params, localized client-side (see Tier 1 below). Never pre-rendered
  // server-side, because the UI locale is per-request, not per-row.
  matchReasons: Array<{ key: string; params?: Record<string, string | number> }>;
  legCount: number; // total participating rows (legs + underlying), excluding representative
  // pre-summed on the server so the client never re-sums (avoids double-count and
  // avoids shipping every underlying row just to compute a header total).
  underlyingTotalAbs: number | null; // ABS sum of charged_amount of underlying purchases
  underlyingCurrency: string | null; // currency of that sum; null if mixed (see RTL/currency note)
}

interface TransactionWithEvent extends TransactionWithCategory {
  event: FinancialEventRef | null;
}
```

The list query collapses an event to its representative row **server-side**, so the existing 50-row pagination (`PAGE_SIZE = 50`, line 87) still counts ledger rows, not raw rows. Choosing the representative deterministically:

- **internal_transfer:** the debit leg (the outflow, `charged_amount < 0`). Per the sign convention, debit is negative.
- **card_payment:** the bank debit (the one negative bank row that settles the bill).
- **atm:** the bank debit.

The non-representative legs and any `underlying` purchases are **not** sent with the page; they are fetched lazily on expand via `GET /api/events/:id` so the list payload and the SSE-driven home refresh stay small. This matters: a card bill can have 30 to 100+ underlying purchases, and shipping all of them inline would blow up the 50-row page.

### 1. How a merged event appears in the transaction list

Render the **representative row only**, in place, with a small inline event badge after the description. Do not introduce a second list or move events out of the ledger; this preserves the "ledger is complete" mental model and matches Copilot's badge-in-list approach.

Badge styling reuses the exact pattern used for the `needsReview` pill (`transactions-table.tsx` lines 454-474) so it is visually native:

```tsx
// new component: src/components/transactions/event-badge.tsx
import { ArrowLeftRight, Banknote, CreditCard, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FinancialEventRef } from "@/lib/types";

const EVENT_META = {
  internal_transfer: { icon: ArrowLeftRight, key: "eventTransfer" },
  card_payment: { icon: CreditCard, key: "eventCardPayment" },
  atm: { icon: Banknote, key: "eventAtm" },
  manual: { icon: Link2, key: "eventMerged" },
} as const;

export function EventBadge({ event }: { event: FinancialEventRef }) {
  const t = useTranslations("transactions");
  const meta = EVENT_META[event.eventType];
  const Icon = meta.icon;
  const suggested = event.status === "suggested";
  // All four event types are "money routed, not spent", so they share the neutral
  // token. We differentiate by ICON, not color, to stay legible for color-blind users.
  const color = "var(--status-neutral)";
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: `color-mix(in oklch, ${color} 18%, transparent)`,
        color,
        outline: suggested ? `1px dashed color-mix(in oklch, ${color} 45%, transparent)` : undefined,
      }}
    >
      <Icon className="h-3 w-3" />
      {t(meta.key)}
      {event.legCount > 1 && <span className="ms-0.5 tabular-nums">{`\u00D7${event.legCount + 1}`}</span>}
    </span>
  );
}
```

Note the count is `legCount + 1` (legs plus the representative) so "×2" reads honestly for a simple two-sided transfer. The `\u00D7` escape avoids a literal `×` that some editors mangle in RTL files.

Microcopy (en.json keys under `transactions`):
- `eventTransfer`: "Transfer"
- `eventCardPayment`: "Card payment"
- `eventAtm`: "ATM"
- `eventMerged`: "Merged"

The representative row also gets a **chevron disclosure**. Do **not** reuse the leading 32px column (line 372): that column already holds the direction arrow (`ArrowUpRight`/`ArrowDownRight`, lines 440-446) keyed off `chargedAmount > 0`, and overloading it would conflict on every row. Instead, render a `ChevronRight`/`ChevronDown` toggle *inside* the description cell, before the description text, only when `event != null`. The direction arrow stays where it is. The toggle uses `ms-0`/`me-1` logical spacing so it sits on the leading edge in both LTR and RTL.

**Expanded state** renders the participating legs as indented sub-rows: a single `<TableRow>` whose one `<TableCell colSpan={7}>` (the table has 7 columns: spacer, date, description, category, account, amount, actions) hosts a nested compact list. This preserves outer column alignment without a second layout. Legs are fetched lazily on first expand (`GET /api/events/:id`) and cached in React Query under `["event", eventId]`. Each leg shows: its account (reuse `TransactionSourceCell` with `provider` + `accountLabel`), its own signed amount via `formatCurrency(amount, currency ?? "ILS", locale)` so debits render negative and credits positive exactly as the ledger does, and a **role chip**:

- **Internal transfer:** "Out of {account}" on the debit leg, "Into {account}" on the credit leg. Clicking a leg deep-links to that row in the ledger (Simplifi's "go to other side").
- **Card payment:** the bank debit is labeled "Bill payment". Underlying card purchases, if linked, are summarized under a subheading "Counted as spending here" showing `legCount` purchases and `underlyingTotalAbs` (the server-computed ABS sum). This is where Spent exceeds Monarch/Copilot: the one-to-many bill↔purchases relationship is made visible and auditable, which is the exact gap in the brief. The purchases are **not** re-summed client-side and the header explicitly states they, not the bill, are the source of spend.

Worked microcopy for the expanded card-payment header, defusing the double-count confusion in plain language (note the amount is the bill's ABS value, since `charged_amount` is negative for the debit):
> "This ₪4,210 bill payment settles your Isracard card. It is not counted as spending. The 38 purchases it covers are already counted on the card."

If `underlyingCurrency` is null (the bank bill is in ILS but underlying purchases were in mixed currencies, common for foreign card spend), drop the summed total and show only the count plus a per-purchase list, because summing across currencies would be a money bug.

### 2. The "why" explanation (match reasons + confidence)

Surface this in two tiers so casual users are not overwhelmed but power users can audit.

**Tier 1, inline on expand:** a one-line plain-English summary built client-side from `matchReasons` (keys + params, localized at render so Hebrew/English follow the active locale):

```ts
// reason keys map to phrases in en.json/he.json under transactions.reasons
function reasonLine(
  reasons: FinancialEventRef["matchReasons"],
  t: ReturnType<typeof useTranslations>,
): string {
  const phrases = reasons.map((r) => t(`reasons.${r.key}`, r.params));
  return t("matchedBecause", { reasons: phrases.join(t("reasonJoin")) });
}
// reasons.amountExact           -> "same amount"
// reasons.amountClose           -> "amounts within {eps}"     (params: { eps: "₪0.01" })
// reasons.dateWindow            -> "{d} days apart"           (params: { d: 2 })
// reasons.oppositeSignCrossAccount -> "opposite directions in two of your accounts"
// reasons.keywordTransfer       -> "description says “{kw}”"  (params: { kw: "העברה" })
// reasons.keywordCardPayment    -> "looks like a credit card bill"
// matchedBecause                -> "Matched because: {reasons}."
// reasonJoin                    -> ", "
```

Reason params carry the matched data (the actual keyword, the epsilon, the day gap) so a Hebrew keyword renders correctly inside an otherwise-English or RTL sentence; we wrap it in directional quotes and let the surrounding `dir="auto"` container resolve bidi, rather than concatenating raw Hebrew into a fixed string.

**Tier 2, confidence:** reuse the `/7` display the AI confidence already uses (line 471: `{txn.aiConfidence}/7`) so the two confidence systems read consistently. The Fellegi-Sunter total match weight is on a 0..7 scale; we map it to a label, not a raw probability, to avoid implying false precision. Show it only in the expanded detail and the review queue, never on the collapsed auto-confirmed ledger row (it would be noise).

```tsx
function confidenceLabel(
  weight: number | null,
  t: ReturnType<typeof useTranslations>,
): { label: string; tone: string; score: string | null } {
  if (weight == null) return { label: t("confManual"), tone: "var(--status-neutral)", score: null };
  const score = `${Math.round(weight)}/7`;
  if (weight >= 6) return { label: t("confHigh"), tone: "var(--status-on-track)", score };
  if (weight >= 4) return { label: t("confMedium"), tone: "var(--status-heads-up)", score };
  return { label: t("confLow"), tone: "var(--status-over)", score };
}
```

Thresholds wired to behavior (the default policy; the user can shift them in §6):
- **weight ≥ 6:** auto-confirm. Event is grouped and collapsed; no review. Both transfer legs are set to `kind='transfer'` at sync time, exactly as `findInternalTransferPairs` already does, so spend/income math is correct immediately.
- **4 ≤ weight < 6:** suggested. Goes to the review queue with the dashed badge. **Legs keep their detected `kind` and stay in spend/income totals** until the user confirms, so nothing vanishes silently.
- **weight < 4:** not grouped, not suggested; rows stay independent. This keeps false positives near zero.

### 3. Review queue for suggested merges

Person-to-person payments and look-alike same-amount coincidences are the dominant false positives (the brief's P2P warning). So suggested merges (the 4..6 band) **must never alter spending math until confirmed.** The existing greedy pairing already excludes `kind='transfer'` rows from re-pairing (line 79), so confirming/rejecting is stable across re-syncs as long as the matcher only proposes from un-confirmed, un-rejected rows.

Surface the queue in two places:

1. A count chip on the existing `needs-attention-card.tsx` home widget: "3 possible transfers to review", reusing that widget's affordance rather than a new nav item. The count is computed server-side as `COUNT(*)` of events with `status='suggested'` for the workspace, returned alongside the existing `needsReviewCount` field (verified present in `src/lib/api.ts` line 328), so the home payload gains one integer, not a row dump.

2. A dedicated review view: a stack of `Card`s, one per suggested event. Each card shows the N legs side by side, the Tier-1 reason line, the confidence label, and three actions:

```
┌─────────────────────────────────────────────────────────┐
│  ⇄  Possible transfer            Medium confidence  4/7   │
│  Matched because: same amount, 2 days apart, opposite     │
│  directions in two of your accounts.                      │
│                                                           │
│  -₪3,000  Hapoalim checking   "העברה לחשבון"    May 3     │
│  +₪3,000  Leumi savings       "העברה מחשבון"    May 4     │
│                                                           │
│  [ Confirm transfer ]  [ Not a transfer ]  [ Split ]      │
└─────────────────────────────────────────────────────────┘
```

Action semantics (all mutations go through new event routes, then invalidate the same query keys the existing `handleKindChange` uses, lines 150-153):
- **Confirm transfer** → `POST /api/events/:id/confirm`. Sets event `status='user_confirmed'`, sets every leg's `kind='transfer'`, invalidates `["transactions"]`, `["summary"]`, `["transactions-summary"]`, `["categories"]`, and `["home"]`. Offers "apply to similar" as a follow-up toast action (§6).
- **Not a transfer** → `POST /api/events/:id/reject`. Sets `status='user_rejected'`, dissolves the link, reverts each leg to its detected `kind` (the pre-merge kind is stored on the event-link row so revert is exact), and writes a `rejected_event_signatures` row keyed on a *normalized, order-independent* signature of the legs (sorted leg dedup_hashes + rounded amount + event_type) so the same pair is not re-suggested next sync. Stickiness is the Copilot/Monarch lesson.
- **Split** → opens the split flow (§4) pre-scoped to this event.

Bulk affordance: "Confirm all" at the top, enabled only for events with `weight ≥ 6` (the auto band is already confirmed, so in practice this button confirms any 6+ events the user manually downgraded; we never bulk-confirm the ambiguous 4..6 middle). This mirrors YNAB "approve matched" / Quicken "Accept All" without the false-positive risk.

### 4. Undo, manual merge, and split controls

All three live in the row's existing trailing `MoreHorizontal` dropdown (lines 560-579), extending today's kind-flip menu (which today only calls `setTransactionKind`, lines 569-577) rather than adding a control surface.

**Undo / unlink.** For any grouped row, add a `DropdownMenuItem` "Ungroup" → `POST /api/events/:id/unlink`. This dissolves the event and restores each leg's pre-merge `kind` (stored on the link row, so undo is lossless), then shows a toast with an inline **Undo** action that re-creates the event from the same stored legs. Because we link rather than collapse, ungroup can never lose a scraped row. Unlinking an auto-confirmed event does **not** write a `rejected_event_signatures` row by default (the user may just want to inspect), but the toast offers "Don't suggest this again" to opt into stickiness.

**Manual merge.** Two entry points:
- **Multi-select mode:** a checkbox column toggled by a "Select" button in the `CardHeader`. Selecting exactly two opposite-sign rows in **different accounts** enables "Mark as transfer"; selecting one bank debit plus N card-purchase rows enables "Link as card payment". This creates a `manual` event with `matchWeight = null`. Guard the two-row transfer case against same-account selection (a transfer within one account is meaningless) and against same-sign selection.
- **From a single row:** "Mark as transfer to…" opens a small `Dialog` to pick the counterpart row (searchable by amount/date, scoped to the opposite sign and a different account). If the user picks an account but no matching row exists, do **not** fabricate a phantom leg (unlike Wave). Instead set just this row's `kind='transfer'` via the existing `setTransactionKind` path and record a one-sided `manual` event with a single leg. This keeps balances honest when the counterpart account is not tracked in Spent, and reuses machinery that already exists.

**Split.** "Split this group" detaches a chosen leg back to its own detected `kind`. For the card-payment case, "This bill is partly an old balance" lets the bank debit become an `expense` (for the carried-over portion) while the card-side legs stay transfers (the Copilot historic-balance escape hatch). This is a per-leg `kind` override plus an event annotation marking the event as partially split, not a whole-event toggle, so the rest of the grouping survives.

### 5. Spending vs net-worth: how the views treat events differently

Make the orthogonality visible: the point of grouping is that a transfer **moves** money without **spending** it (YNAB/Simplifi: counted once, at purchase, never at payment).

- **Spending and category views** (`category-grid`, `hero-card`, budgets): behavior unchanged; they already filter `kind='expense'` and use `ABS(charged_amount)`. Grouped transfer/card-payment legs are excluded by construction. Add one trust affordance under the period total: a muted "Excluded: 4 transfers, 1 card payment", each segment linking to a ledger pre-filtered to those event types. This is Simplifi's "Excluded this month" and reassures the user money was routed, not lost. The counts come from one server-side aggregate over the same period filter the total already uses, so it is one extra grouped query, not an N-row scan.
- **Per-event "exclude from spending" indicator:** on the expanded event and in the representative row's tooltip, a muted pill "Not counted as spending" with the reason ("Transfer between your accounts" / "Credit card bill; the purchases are counted instead").
- **Keep "transfer" (an event property) separate from "hide from reports" (the per-merchant `excluded_merchants` table).** Do not overload `excluded_merchants` with transfer logic: hiding a merchant is decluttering; marking a transfer is routing money correctly. Net worth must be computed from account balances, never from the spend ledger, so excluding a transfer from spend has zero net-worth effect (the bill payment settles a liability and nets to zero across the two accounts). State this explicitly in the data-model section so the balance computation is never derived from `SUM(charged_amount WHERE kind='expense')`.

### 6. Settings: matching aggressiveness + the existing ATM toggle

Add a new `MatchingCard` to `src/app/[locale]/settings/general/page.tsx`, immediately above `AtmCard`, following `AtmCard`'s exact structure (verified lines 293-333): controlled local state, `useMutation(updateSettings)`, dirty check, save button gated on `dirty`, `["settings"]` invalidation, success/error toast. Expose a three-way `Select` (remember: base-ui `Select`, `onValueChange` returns `string | null`, so guard the setter):

```tsx
function MatchingCard({ initial }: { initial: "conservative" | "balanced" | "aggressive" }) {
  const t = useTranslations("settings.general");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [mode, setMode] = useState(initial);
  // conservative: auto >= 6.5, suggest >= 5.5  (almost only exact matches auto-apply)
  // balanced:     auto >= 6.0, suggest >= 4.0  (default; the §2 thresholds)
  // aggressive:   auto >= 5.0, suggest >= 3.0  (more auto-grouping, more review noise)
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(tCommon("saved"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("failedToSave"));
    },
  });
  const dirty = mode !== initial;
  return (
    <SettingCard title={t("matchingTitle")} description={t("matchingDescription")}>
      <Select value={mode} onValueChange={(v) => v && setMode(v as typeof mode)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="conservative">{t("matchConservative")}</SelectItem>
          <SelectItem value="balanced">{t("matchBalanced")}</SelectItem>
          <SelectItem value="aggressive">{t("matchAggressive")}</SelectItem>
        </SelectContent>
      </Select>
      <p className="mt-1 text-[11px] text-muted-foreground">{t(`matchHint.${mode}`)}</p>
      <div className="mt-5 flex justify-end">
        <Button
          onClick={() => mutation.mutate({ transferMatching: mode })}
          disabled={!dirty || mutation.isPending}
        >
          {mutation.isPending ? tCommon("saving") : tCommon("saveChanges")}
        </Button>
      </div>
    </SettingCard>
  );
}
```

Microcopy:
- `matchConservative`: "Conservative - only group obvious matches automatically"
- `matchBalanced`: "Balanced - group clear matches, ask about the rest" (default)
- `matchAggressive`: "Aggressive - group more, expect more review"
- `matchHint.balanced`: "We auto-group transfers we are sure about and send borderline ones to your review queue."

The mode persists as one new `settings` key, `transferMatching` (string, defaulting to `"balanced"`), read by the matcher in the data-model section. Changing it never retroactively dissolves `user_confirmed` or `user_rejected` events (those are sticky user decisions); it only changes thresholds for future syncs. Offer an optional "Re-scan existing transactions" button that triggers a one-off matcher pass over the existing ledger. That pass must be **bounded**: the current `findInternalTransferPairs` is O(debits × credits) within its input set, which is safe for a single sync window but would be quadratic over a full multi-year ledger. The re-scan must therefore window candidates (e.g. group by currency, then slide a `dayWindow + epsilon` bucket over date-sorted rows) rather than feeding the entire `transactions` table into one pairing call. Specify this bound in the matching section.

Keep `AtmCard` exactly as-is (`treatAtmAsTransfers`); it now reads as the ATM-specific complement to the general control, and ATM events flow through the same `EventBadge` (`eventType: "atm"`).

### 7. Empty / first-run guidance

- **Before any sync, or with a single connected account:** cross-account transfer detection is impossible with one account, so suppress the review-queue affordance and show an inline note: "Transfers are detected once you connect more than one account. Connect a bank and a card to see them here." Link to the bank-connection settings. (Card-payment grouping can occur with a single bank + single card, so do not gate that case on account count.)
- **First detected event:** the first time an event is auto-confirmed, show a one-time dismissible info banner above the ledger, reusing the `ai-not-connected-banner.tsx` pattern: "We grouped a transfer between two of your accounts so it is not double-counted as spending. You can review or undo any grouping from the row menu." Persist the dismissal in `settings` (one boolean key) so it does not reappear each session.
- **Empty review queue (healthy state):** "Nothing to review. Transfers and card payments we are confident about are grouped automatically." with a link to "See grouped transactions" (the ledger filtered to `event != null`).

### 8. Trust checklist (acceptance criteria for the UI)

Review the implementation against these; trust is the feature.
1. Every grouped row expands to show every participating leg and underlying purchase, each with its account and signed amount. No scraped row is ever invisible.
2. Every auto-confirmed grouping is reversible in ≤ 2 clicks (row menu → Ungroup) with a toast-level Undo, and unlink restores each leg's exact pre-merge `kind`.
3. No money leaves spend math without a visible counterweight: the "Excluded: N transfers" line under every period total links to the excluded rows.
4. Suggested (4..6 band) groupings never alter spend/income totals until the user confirms; legs keep their detected `kind` while suggested.
5. Confidence and reasons are always retrievable (expanded detail + review queue), using the same `/7` scale and the same status-color tokens as AI confidence.
6. Rejecting a suggestion is sticky via a normalized, order-independent leg signature (not re-suggested next sync); confirming offers "apply to similar".
7. Re-sync is idempotent: re-running a sync does not duplicate, re-suggest, or silently re-flip `user_confirmed`/`user_rejected` events.
8. Currency-safe: no header or total ever sums across currencies; mixed-currency underlying purchases show a count and per-row list, not a fabricated total.
9. RTL-safe: all new components use logical properties (`ms-*`, `me-*`, `ps-*`, `paddingInlineStart`) as the current table does, wrap mixed Hebrew/English reason strings in `dir="auto"`, and inject matched Hebrew keywords as i18n params rather than concatenating them into fixed strings.

Cross-references: the FinancialEvent schema, the widened provider set, the bounded match-weight scorer, and the per-leg `kind` reconciliation are specified in the data-model and matching sections; this section consumes their outputs and assumes the additive SQLite migrations they define.

---

## Scalable Implementation Strategy

This section specifies how to build the financial-event grouping layer so it is correct on a single local SQLite file at the realistic scale (tens of thousands of rows per workspace), stays sub-quadratic so it would survive much larger histories, and remains backward compatible with the existing `kind` column and the exact dedup in `src/server/lib/dedup.ts`. The guiding principle, borrowed from the record-linkage literature (Splink, Christen): never do full pairwise comparison. Block first, score the small candidate set, then route by confidence. The existing `findInternalTransferPairs` in `src/server/lib/internal-transfers.ts` is already a pure, DB-free, clock-free function; we generalize that shape into the whole matcher so it stays unit-testable.

Before any of this, three facts about the current code constrain the design and correct several tempting-but-wrong assumptions:

- **There is no credit-card "bill credit" row to pair against.** Card providers (`isracard`, `cal`, `max`, `amex`, ...) return per-purchase rows only; they do not return a single "bill posted" credit on the card account. The bank side returns one debit (the monthly bill) with `charged_amount < 0`. So a CC bill payment is **not** a symmetric two-leg amount match and cannot be discovered by amount blocking against a phantom credit. It is a single bank debit whose amount approximately equals the **sum** of the underlying purchases over a billing cycle. Today `detectKind` already flips that single bank debit to `kind='transfer'` so it does not double-count; the event layer must make the one-to-many relationship explicit without inventing a second leg.
- **`detectKind`, the keyword sets, and `021_reclassify_credit_card_transfers.sql` only fire for `hapoalim` and `leumi`** (`BANK_PROVIDERS_SET` in `src/server/lib/transfers.ts` contains exactly those two). Every place the design says "bank provider" means "a provider in that set." New banks do nothing until added there. The event layer must inherit, not silently widen, this gate.
- **The dedup hash keys on `originalAmount`/`originalCurrency`, not `chargedAmount`.** The `ON CONFLICT` upsert in `insertTransactions` updates `status`, `charged_amount`, and `processed_date` only when the prior row was `pending`, and it **explicitly preserves `kind`** (`kind = transactions.kind`). So a pending->posted transition keeps the same hash/sequence and updates the row in place; it never creates a duplicate, but it also never re-runs `detectKind`. Re-classification therefore has to treat "row whose `status` flipped to `completed` this sync" as dirty even though no new row was added.

### 1. Keep candidate generation near-linear (blocking)

`findInternalTransferPairs` is already better than naive O(n^2): it splits into debits and credits, sorts by `abs(chargedAmount)`, and for each debit scans credits picking the closest-date match (it is closest-date-wins, not first-fit, and ties are broken by the deterministic `sortKey`). On a 3-month window the inner credit list is small, so this is fine today, but it degrades quadratically as the window or account count grows. Replace the nested scan with explicit amount blocking so work is proportional to rows-per-amount-bucket, not the product of debit and credit counts.

The block key for transfer pairing is the integer charged amount in agorot plus the charged currency: `Math.round(Math.abs(chargedAmount) * 100)` combined with `chargedCurrency`. Two halves of an internal transfer agree on charged amount and currency; only the date carries slack. Bucketing on the integer amount turns pair generation into: build a `Map<bucketKey, Leg[]>`, then within each bucket do the small cross-product only for opposite-sign rows in different accounts whose dates fall inside the window. This is O(n) to build the map plus O(sum of per-bucket cross-products), which is effectively linear because legitimate same-amount collisions are rare. Use `chargedAmount`/`chargedCurrency` (not `originalAmount`) for blocking because that is the field both transfer legs share after FX, and it is the field analytics use.

```ts
// src/server/lib/matching/blocking.ts  (pure, no DB, no clock)
export interface Leg {
  id: number;
  credentialId: number | null;
  accountNumber: string;
  provider: string;
  dayNumber: number; // Math.floor(Date.parse(date.slice(0, 10)) / 86_400_000)
  amountAgora: number; // Math.round(chargedAmount * 100), signed; debit < 0
  currency: string | null; // charged currency
  description: string;
  kind: "expense" | "income" | "transfer";
}

export function blockByAmount(legs: readonly Leg[]): Map<string, Leg[]> {
  const buckets = new Map<string, Leg[]>();
  for (const leg of legs) {
    if (leg.kind === "transfer" || leg.amountAgora === 0) continue;
    const key = `${Math.abs(leg.amountAgora)}|${leg.currency ?? ""}`;
    const arr = buckets.get(key);
    if (arr) arr.push(leg);
    else buckets.set(key, [leg]);
  }
  return buckets;
}
```

Blocking on integer agorot also removes the floating-point `epsilon` comparison the current code does (`Math.abs(...) > 0.01`): equal agora counts are exactly equal integers, so there is no FP slack and no money rounding bug. Mixed-currency rows never collide because currency is part of the key; a genuine cross-currency transfer (charged ILS on one side, USD on the other) will **not** auto-pair, which is correct, because we have no FX rate to assert equality and must not silently net out two different-currency amounts.

For fuzzy description matching in Phase 2 (when amount alone is ambiguous, e.g. several identical-amount transfers in one bucket), add a second blocking pass on `amountAgora + dayBucket` and only then run the string comparator on the few residual collisions. Do not run string similarity across the whole window; reserve it for tie-breaking inside an already-blocked bucket, which keeps the expensive comparator off the hot path. This matches Baxter/Christen's finding that exact-key blocking plus a narrow string pass beats global similarity.

### 2. Bound work to the sync window, and treat the CC bill as a one-to-many sum, not a pair

Ordinary internal transfers are already bounded by `getInternalTransferCandidates(workspaceId, fromDate)` where `fromDate = toLocalISODate(startDate)`. Both legs land within `dayWindow` (default 2) of each other, well inside the window. Keep that bound for transfers.

The credit-card bill payment is structurally different and must not be modelled as a 1:1 amount match. One bank debit (the bill) corresponds to the **sum** of N card purchases that posted over the prior billing cycle (Israeli cards: purchases through cycle close, billed mid-to-late the following month, so purchases can be up to ~45 days before the bill date). There is no single card-account row equal to the bill amount. Two consequences:

- The bank debit keeps the existing behavior: `detectKind` already flips it to `kind='transfer'` (for `hapoalim`/`leumi` only) when it matches `CREDIT_CARD_PAYMENT_PATTERNS`, so it is excluded from spend and does not double-count against the per-purchase rows. The event layer wraps that single row in a `cc_payment` event with one `bill_payment` member, preserving today's reporting exactly.
- Linking the bill to its underlying purchases is a **separate, looser, audit-only linkage** keyed on the card credential and the billing period, validated by `abs(sum(purchases) - abs(bill)) <= tolerance` (a few agorot for rounding plus optional fees). It must never change `kind` on the purchases (they are real expenses and must stay counted) and never change `kind` on the bill beyond the transfer flag it already has. It is purely explanatory: "this bill = these 37 purchases." Because it is a sum check, not an amount-equal check, it does not go through `blockByAmount`; it is computed per card credential over the lookback window.

Bound the purchase lookback explicitly so a bill near the start of the sync window can still reach its purchases without rescanning all history, and scope that fetch to card-provider credentials only so it does not enlarge the transfer-pair candidate set:

```ts
const CC_LOOKBACK_DAYS = 45;
const ccFrom = toLocalISODate(addDays(startDate, -CC_LOOKBACK_DAYS));
```

If a card credential is not synced (the user only connected the bank, not the card), the sum will not reconcile; in that case create no purchase links and leave the bill as a plain `cc_payment` event with `confidence` reflecting the missing evidence. Never fabricate purchase members.

### 3. Incremental re-matching (touch only new and affected events)

Re-running a sync must not re-evaluate every historical row. The matcher operates on a working set of dirty legs. `insertTransactions` returns `{ added, updated }` and stamps `sync_run_id` on inserted rows, but note that the `ON CONFLICT` upsert preserves the **original** `sync_run_id` (it is not in the `DO UPDATE SET` list), so `updated` rows do not advertise themselves via `sync_run_id`. The dirty set is therefore the union of:

- rows with `sync_run_id = currentSyncRunId` (genuinely new this sync), and
- rows whose `status` changed to `completed` during this sync (pending->posted reconciliations, which `insertTransactions` counts in `updated` but does not re-`kind`).

To surface the second set without scanning everything, have `insertTransactions` collect the ids it upserted-as-update and return them (a small additive change: add `updatedIds: number[]` to `InsertResult`), or, more conservatively, select rows in the window with `updated_at >= syncStartedAt AND status = 'completed' AND kind = 'expense'`. Expand the dirty set by one blocking hop (other rows sharing the same amount bucket within the date window, plus same-card-credential rows within the CC lookback). Anything not in a touched bucket is left alone.

Re-matching is idempotent: if a dirty leg is already a member of an event whose membership and scores are unchanged, skip it. Recompute an event only when a member leg is new, or when a pending->posted flip changed its `charged_amount` (which can move it into a different amount bucket, since the upsert does update `charged_amount`). A no-op sync touches zero events; a sync adding 200 rows touches only the events those 200 rows participate in.

### 4. Data model: events as additive migrations

Two new tables plus the existing `kind` stay the source of truth for reporting. The event is an explicit, auditable, reversible entity with member legs and a representative leg, generalizing the boolean-ish `kind='transfer'` flag without breaking it: `kind` remains the fast reporting filter, the event tables explain why.

Migration files are applied in lexicographic name order by `src/server/db/migrate.ts`, and the repo already contains duplicate numeric prefixes (`020_excluded.sql` and `020_multiple_bank_credentials.sql`; `021_chat_sessions.sql` and `021_reclassify_credit_card_transfers.sql`). Numeric uniqueness is not enforced, only filename uniqueness, and sort order between same-number files is alphabetical, which has already changed apply order once. Use a fresh, unused prefix and a descriptive name to avoid an ambiguous ordering: `022_financial_events.sql`. Each migration runs inside a transaction with `foreign_keys = OFF` for its duration and a `foreign_key_check` afterward, so any FK declared here is verified at apply time.

```sql
-- src/server/db/migrations/022_financial_events.sql
CREATE TABLE financial_events (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,             -- 'internal_transfer' | 'cc_payment' | 'atm' | 'loan' | 'investment'
  representative_txn_id INTEGER,        -- leg used for reporting/display (nullable until chosen)
  confidence REAL NOT NULL DEFAULT 0,   -- 0..1, P(match) from the additive score
  match_reasons TEXT,                   -- JSON: {"reasons":["amount_exact","opposite_sign","date_gap=1","kw:העברה"],"priorKind":{"123":"expense","456":"income"}}
  source TEXT NOT NULL DEFAULT 'auto',  -- 'auto' | 'user' | 'rule' | 'backfill'
  status TEXT NOT NULL DEFAULT 'suggested', -- 'suggested' | 'confirmed' | 'rejected'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE financial_event_members (
  event_id INTEGER NOT NULL REFERENCES financial_events(id) ON DELETE CASCADE,
  txn_id INTEGER NOT NULL,
  role TEXT NOT NULL,                   -- 'debit' | 'credit' | 'bill_payment' | 'purchase'
  prior_kind TEXT NOT NULL,            -- the leg's kind BEFORE this event flipped it; lossless undo
  PRIMARY KEY (event_id, txn_id)
);

-- One txn can belong to at most one *active* (non-rejected) event of the merge kind.
-- Enforce single membership for the flip-bearing roles so a row is never double-grouped.
CREATE UNIQUE INDEX idx_fem_single_active_member
  ON financial_event_members(txn_id)
  WHERE role IN ('debit', 'credit', 'bill_payment');

CREATE INDEX idx_fe_workspace_type ON financial_events(workspace_id, event_type);
CREATE INDEX idx_fem_txn ON financial_event_members(txn_id);
```

`prior_kind` lives on the member, not in a JSON blob, so undo is a trivial deterministic write and does not depend on parsing `match_reasons`. (The JSON copy in `match_reasons.priorKind` is for display only.) The partial unique index makes "a transaction is in at most one active transfer/bill event" a database invariant rather than a convention, which prevents the matcher from ever flipping a row into two events on a re-sync. `purchase` members are deliberately excluded from that index because one purchase belongs to exactly one bill, but a bill links many purchases, and purchases must remain individually counted as expenses regardless.

Backward compatibility: every spend/income query keeps filtering on `kind`; no analytics query changes. When an event auto-confirms, the same `markTransfersByIds` write flips `kind` to `transfer` for the `debit`/`credit`/`bill_payment` members exactly as today, so reporting is byte-for-byte unchanged for the keyword-confident cases. `representative_txn_id` is what dashboards display for a grouped event, so N legs collapse to one line without deleting any row (a pointer-join, not a destructive merge). Note the FK story: there is no FK from event tables to `transactions(id)` here because that would require `transactions` to be the parent and complicate the existing recreate-style migrations; integrity is instead maintained by the matcher always writing members for live rows and by `ON DELETE` being a non-issue (the app never hard-deletes transactions). If a referential guarantee is wanted later, add `txn_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE` in a follow-up migration once the recreate pattern for `transactions` is retired.

### 5. Store-agnostic, pure matching core

All scoring and pairing live in pure functions under `src/server/lib/matching/`, mirroring `findInternalTransferPairs`: plain rows in, plain proposals out, no DB and no `Date.now()`. The DB layer only loads the bounded candidate `Leg[]` and persists the resulting events. This is what lets the project move from SQLite to Postgres later without rewriting matching; only the thin query layer (`src/server/db/queries/transactions.ts` plus a new `events.ts`) is store-specific.

```ts
// src/server/lib/matching/index.ts  (pure)
export interface MatchInput {
  legs: readonly Leg[];
  thresholds: { autoMin: number; reviewMin: number }; // policy, injected
  weights: FeatureWeights;                              // m/u-derived, injected
  ccToleranceAgora: number;                             // bill-vs-sum slack, injected
}
export interface ProposedEvent {
  eventType: "internal_transfer" | "cc_payment" | "atm" | "loan" | "investment";
  members: { txnId: number; role: string; priorKind: Leg["kind"] }[];
  representativeTxnId: number;
  confidence: number;       // 0..1
  matchReasons: string[];
}
export function proposeEvents(input: MatchInput): ProposedEvent[] { /* block + score + sum-check */ }
```

Thresholds, weights, and the CC sum tolerance are injected, never hardcoded inside the matcher, because the Fellegi-Sunter framing makes thresholds policy choices, not statistical facts. This keeps the core deterministic for tests: feed a fixed `Leg[]` and fixed policy, assert the exact `ProposedEvent[]`. The `dayNumber` precompute keeps all date parsing out of the scorer, so there is no clock and no flakiness.

### 6. Scoring: Fellegi-Sunter with three zones

Replace the boolean "keyword AND amount-within-epsilon AND date-within-window" gate with an additive weighted score, yielding a confidence to persist and to route on. Per feature, weight = log2(m/u); total weight M is additive; P(match) = 2^M / (1 + 2^M). Seed plausible weights, tune later (m/u can be learned via EM once labelled data exists):

| Feature | Agree weight | Notes |
|---|---|---|
| amount exact (agora-equal, same currency) | +6 | high-signal, near-required for transfer pairs |
| opposite sign, different owned account | +4 | distinguishes transfer from a same-account duplicate |
| date gap 0-1 day | +2 | from `dayNumber` diff |
| date gap 2-3 days | +1 | settlement lag |
| internal-transfer keyword (either side) | +2 | `matchesInternalTransfer` |
| CC-payment keyword on bank side (hapoalim/leumi) | +3 | `CREDIT_CARD_PAYMENT_PATTERNS` |
| CC bill sum reconciles (abs(bill) == sum(purchases) +/- tolerance) | +5 | one-to-many evidence, replaces amount-exact for `cc_payment` |
| description similarity (Phase 2, normalized Jaro-Winkler >= 0.9) | +1 | tie-break within bucket only |

Currency disagreement is a hard veto for transfer pairs, not a negative weight: if currencies differ, the pair is never proposed (Section 1), because we cannot assert amount equality across FX.

Three zones (policy, tunable via settings): `confidence >= 0.97` auto-confirm (write event with `status='confirmed'`, flip `kind` on flip-bearing members); `0.80 <= confidence < 0.97` suggest (write event with `status='suggested'`, set `needs_review = 1` on those members, surface in the review queue) and **do not flip `kind`** so a merely-suggested merge can never silently hide a real expense; `< 0.80` propose nothing. This maps Plaid's VERY_HIGH/HIGH/MEDIUM gate and Splink's upper/lower clerical-review band onto the existing `needs_review` column that already feeds `getNeedsReviewCountByCategory` and `pendingReviewCount`. The crucial safety property: a row only leaves spend/income analytics when an event is `confirmed`; suggestions are visible-and-counted until a human (or a high-confidence auto rule) accepts them.

### 7. Performance budget and inline vs background

Today reclassification runs inline in `syncWorkspace` (the `findInternalTransferPairs` block around lines 409-418 of `orchestrator.ts` and the ATM block at 420-438), inside the SSE request, after all inserts and before AI categorization. Budget and placement:

- Per-sync matching budget: < 250 ms for a typical 3-month window (a few thousand candidate legs). Blocking makes this trivially achievable; the old nested loop is the only thing that could blow it.
- Keep matching inline but move it behind one new orchestrator step `runEventMatching(workspaceId, syncRunId, startDate, syncStartedAt)` that wraps the dirty-set load, the pure `proposeEvents` call, and the persist. Emit `send("stage", { stage: "matching" })` so the UI shows progress, consistent with the existing `"categorizing"` and ollama stages.
- Hard escape hatch by candidate count, not by row count: if the bounded `Leg[]` exceeds a ceiling (e.g. 50k legs, only on a first full historical sync), still run the bill-payment single-row flips inline (cheap, per-credential) but defer the cross-account transfer pairing to a second `runEventMatching` call issued after the SSE `complete` event with the full window. Because matching is idempotent and incremental, running it twice is safe and the second pass only does the deferred work. There is no job queue in the stack; do not invent one. Reuse the existing inline call site and gate on `legs.length`.

Memory bounds: the matcher holds only the bounded `Leg[]` (a handful of scalars per row) plus the per-bucket `Map`. For 50k legs that is single-digit MB. Never load full `TransactionRow` objects into the matcher; the dedicated candidate queries (`getInternalTransferCandidates` already selects only its needed columns) are the pattern to follow. Add a parallel `getCcPurchaseCandidates(workspaceId, ccFrom, cardCredentialIds)` that selects only `id, credential_id, account_number, date, charged_amount, charged_currency, description, kind`.

### 8. Reuse the existing batch insert pattern

Persisting events reuses `db.transaction(() => { ... })` exactly as `insertTransactions`, `batchUpdateCategories`, and `batchSetNeedsReview` do, so event writes inherit the WAL and `busy_timeout` settings from `src/server/db/index.ts` and are atomic. One transaction per sync wraps: insert into `financial_events`, insert members (with `prior_kind` captured from the live row before any flip), set `representative_txn_id`, and the existing `markTransfersByIds` / `batchSetNeedsReview` calls for confirmed events only. A partially-matched state is never visible. The partial unique index from Section 4 means a concurrent or repeated insert of the same membership fails loudly inside the transaction rather than producing a double-grouped row.

### 9. Deterministic unit testing

Because the core is pure, tests use `bun test` with fixed inputs and no DB:

- `blockByAmount`: assert bucket membership for crafted amounts/currencies, including the 0-amount and already-`transfer` exclusions, and that two currencies with equal agora counts land in different buckets (no cross-currency netting).
- `proposeEvents`: feed fixed `Leg[]` with precomputed `dayNumber`, fixed weights/thresholds/tolerance; assert exact `ProposedEvent[]`, confidence, and `matchReasons`. Cover: a clean transfer pair (closest-date-wins when two credits tie on amount, matching today's `sortKey` behavior); a CC bill payment where `abs(bill)` equals the sum of N purchases within tolerance (one `bill_payment` + N `purchase` members, none of which flip `kind`); a CC bill whose purchases are absent because the card was not synced (single-member `cc_payment`, no fabricated purchases, lower confidence); two identical-amount transfers in one bucket (greedy assignment must not cross-link, and the partial-unique invariant must hold); an opposite-sign pair in the **same** account (must not pair); a cross-currency opposite-sign pair (must not pair); and a pending->posted `charged_amount` drift that moves a leg into a new bucket (must re-bucket and reconcile, not duplicate).
- Keep the existing `findInternalTransferPairs` tests as a regression backstop during Phase 1: Phase 1 must reproduce its exact output for the keyword-confident cases.

Keep the `--conditions react-server` runner so `server-only` resolves to a no-op, as the CI gate already does.

### 10. Concrete phased rollout

**Phase 0: Ship the event model and backfill (no behavior change).**
- Migration `022_financial_events.sql` (tables and indexes above).
- Migration `023_backfill_events.sql`: derive `financial_events` from current state so history is not lost, idempotently (guard with `WHERE NOT EXISTS` against `financial_event_members` so a re-apply, or a second backfill of the same row, is a no-op). For every existing `kind='transfer'` row on `hapoalim`/`leumi` that matches `CREDIT_CARD_PAYMENT_PATTERNS` (reuse the exact `LIKE` clauses from `021_reclassify_credit_card_transfers.sql` so the set matches), create a `cc_payment` event with that row as the `bill_payment` member, `prior_kind='expense'`, `source='backfill'`, `confidence=1`, `status='confirmed'`. For the remaining `kind='transfer'` rows, a one-time Node backfill script (not pure SQL, since pairing needs `findInternalTransferPairs`) re-runs the pairing over historical windows and writes `internal_transfer` events for recovered pairs, capturing each member's current `kind` as `prior_kind`. `kind` is untouched throughout, so every dashboard keeps working identically.
- New query module `src/server/db/queries/events.ts` (create/read/confirm/reject/unlink), and pure `src/server/lib/matching/blocking.ts`.

**Phase 1: Generalize internal-transfer and CC-payment into events with confidence and a review queue.**
- Refactor the inline blocks in `orchestrator.ts` into one `runEventMatching` call that uses `proposeEvents`. Keyword-confident transfer and CC-payment cases must produce events whose auto-confirm flips `kind` exactly as `markTransfersByIds` does today, so reporting is byte-for-byte unchanged for those cases.
- Generalize `detectKind` in `src/server/lib/transfers.ts`: the bank-side CC-payment detection (still gated on `hapoalim`/`leumi`) becomes a single-leg `cc_payment` event proposer so the per-row insert-time flip and the cross-account pass share one code path. Crucially, keep the insert-time flip itself (it is the cheap, correct default that prevents double-counting on the very first render); the event proposer only adds the auditable wrapper. Do not move CC detection out of the insert path, or a freshly synced bill would count as spend until the matching step ran.
- Build the review queue UI on the existing `needs_review` plumbing plus `financial_events.status`. Add confirm/reject/unlink endpoints that update `financial_events` and re-derive `kind`. Unlink restores each member's `kind` from `prior_kind` (lossless undo), deletes the event (cascading members), and clears `needs_review`. Confirm flips `kind` for the flip-bearing members; reject leaves `kind` untouched (it was never flipped for a suggestion) and marks `status='rejected'`.
- Persist `confidence` and `match_reasons` for every event; show them in detail: "matched because: exact amount, opposite sign, dates 1 day apart, keyword העברה."

**Phase 2: Fuzzy matching, ATM/loan/investment, rule tuning.**
- Add the description-similarity feature only as an intra-bucket tie-breaker (Section 1). Normalize Hebrew first: strip RTL/LTR control marks (U+200E, U+200F, U+202A-U+202E), strip niqqud (U+0591-U+05C7), collapse the geresh/gershayim and whitespace, and apply NFC, before comparison. Lean on amount+date over the Hebrew string, since phonetic/Latin-oriented similarity is unreliable on Hebrew script; Jaro-Winkler here operates on already-normalized code points, not transliteration.
- Promote ATM (`isAtmWithdrawal`, currently the ad hoc block at lines 420-438) into an `atm` proposer, and add `loan` and `investment` proposers behind the same `proposeEvents` interface. Preserve the existing `treatAtmAsTransfers` setting semantics exactly (flip to transfer vs. file under "Cash & ATM").
- Add a per-event-type rule layer (Monarch/Copilot pattern): user rules keyed on the raw `description` (not a cleaned name) that set event type and/or auto-confirm, applied retroactively. Reuse the existing `merchant-memory` and `category-corrections` infrastructure rather than building a parallel store.
- Add a settings-driven threshold tuner so `autoMin`/`reviewMin`/`ccToleranceAgora` are adjustable, with a validation harness that replays a labelled sample to estimate false-merge rate at each cutoff before applying. False-merge is the dangerous direction here (it hides real expenses), so the harness must report it separately from missed-merge.

**Phase 3: Embeddings and scale-out.**
- Use Sentence-BERT-style embeddings of normalized descriptions purely as a fast candidate blocker and one more scorer feature, never as a replacement for the transparent additive scorer. Keep it optional and local, consistent with Spent's local-first, AI-optional posture; it must degrade to keyword+amount blocking when no model is present.
- Abstract `events.ts` and `transactions.ts` behind a store interface so Postgres becomes a drop-in for multi-install hosting. The matching core needs zero changes because it is already pure and store-agnostic. At Postgres scale, the same amount-bucket blocking becomes an indexed join, and the per-bucket cross-product stays the bounded unit of work.

---

Files referenced (all absolute):
- `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/server/lib/internal-transfers.ts`
- `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/server/lib/transfers.ts`
- `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/server/lib/dedup.ts`
- `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/server/sync/orchestrator.ts`
- `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/server/db/queries/transactions.ts`
- `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/server/db/migrate.ts`
- `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/server/db/migrations/007_transfers.sql` and `021_reclassify_credit_card_transfers.sql`
- `/Users/alonb/conductor/workspaces/spent-v1/pattaya-v3/src/app/api/sync/route.ts`

---

## Appendix: Industry Practices

Condensed from the research phase. Used to ground the recommendations above.

### Record linkage / entity resolution literature and engineering docs. Primary authoritative sources: Splink (UK Ministry of Justice) Fellegi-Sunter theory + string comparators docs (moj-analytical-services.github.io/splink), Python Record Linkage Toolkit indexing docs (recordlinkage.readthedocs.io), Baxter/Christen "A Comparison of Fast Blocking Methods for Record Linkage" (ANU, users.cecs.anu.edu.au/~Peter.Christen), Christen "A Comparison of Blocking Methods" (arxiv.org/pdf/1407.3191), Ditto "Deep Entity Matching with Pre-Trained Language Models" (arxiv.org/pdf/2004.00584), "Pre-trained Embeddings for Entity Resolution" (vldb.org/pvldb/vol16/p2225-skoutas.pdf), Babel Street fuzzy name matching, and reconciliation engineering writeups (zerabooks.com, techinterview.org). NOTE: this research targets generic record-linkage technique; finance-aggregator-specific thresholds are mostly NOT publicly documented and are flagged as such.

- **Transfer detection:** Not the focus of this research strand (transfer detection between owned accounts is a domain-specific pairing problem, not generic entity resolution). The transferable mechanism: treat candidate transfer pairs the same way you treat duplicate pairs - generate candidates via blocking, then score. Concrete blocking key for transfers = bucket on abs(amount) + a date window (the reconciliation literature uses amount-exact + date +/-1 to +/-3 days; settlement-delay-aware matching allows up to N settlement days). The distinguishing signal vs a true duplicate is OPPOSITE SIGN amounts across DIFFERENT owned accounts (one debit, one credit of equal magnitude), whereas a duplicate is SAME account or same import source with same sign. So the same Fellegi-Sunter additive-weight machinery applies; you just add a feature comparator for "sign-opposite & cross-account" that pushes toward transfer rather than duplicate. Not publicly documented for any specific consumer aggregator.
- **Credit-card payment matching:** Not directly covered by the entity-resolution sources. The transferable principle from the bank-reconciliation literature: holds/provisional rows and settlement rows should be LINKED rather than COLLAPSED ("deduplication logic linking rather than collapsing holds into settlements using merchant and amount tolerance"). Applied to CC-bill-payment vs underlying purchases: a CC bill payment is one large debit on the checking account that equals the SUM of many small purchases on the card. This is NOT a 1:1 duplicate and must not be matched by per-transaction amount/date similarity - the amounts and counts differ. The correct model is a one-to-many aggregate linkage (one payment <-> a statement batch of purchases), distinct from the pairwise dedup problem. The same payment also forms a transfer pair with the corresponding credit on the card account. Concrete consumer-aggregator thresholds for this are not publicly documented.
- **Internal linking / data model:** Data-model patterns from the literature: (1) Generate candidate pairs via an INDEX/blocking step, score each pair, then assign a shared cluster/linked identifier to pairs above a merge threshold - "record pairs above a specified threshold are considered the same person and assigned a new linked identifier" (Splink/MoJ). (2) Three-bucket classification per Fellegi-Sunter: MATCH (auto-link), NON-MATCH (ignore), INDETERMINATE (route to clerical/user review). (3) Persist the comparison vector and per-feature match weights alongside the decision so links are explainable and reversible. (4) For clustering many records into one entity, links are transitive (connected components) - but beware that low-confidence edges can chain unrelated records together, so cluster at a higher threshold than pairwise. Splink stores model parameters (m/u per comparison level) separately from the link decisions, which keeps the model auditable.
- **Dedup + matching heuristics:** BLOCKING/INDEXING (avoid O(n^2)): full pairwise comparison "scales quadratic" and is infeasible at scale (Python Record Linkage Toolkit, Christen). Options, with concrete params: (a) STANDARD BLOCKING - only compare records sharing an exact blocking key (e.g. same amount, or same rounded amount + same day); reduces comparisons drastically but misses pairs that disagree on the key. (b) SORTED NEIGHBOURHOOD - sort by a key, slide a window of width w over the sort order, compare records within the window; toolkit default window=3, "window of 1 returns the blocking index," larger window = more pairs/recall. Good when the key has spelling/value variation. (c) Q-GRAM / BIGRAM INDEXING and CANOPY CLUSTERING (cheap TF-IDF distance to form overlapping canopies, then expensive compare only within shared canopy) - Baxter/Christen found bigram indexing and canopy/TF-IDF give "large performance speed-ups and better accuracy" vs standard blocking and sorted-neighbourhood. (d) Multiple blocking passes (a disjunction of keys) to recover recall lost by any single key. For transactions, a natural cheap block = exact amount + date bucket, since true duplicates almost always share amount.

SIMILARITY for short noisy strings (merchant/description): LEVENSHTEIN - insert/delete/substitute, best for general single-char typos, but does NOT handle adjacent transpositions. DAMERAU-LEVENSHTEIN adds transpositions ("CAKE"->"ACKE" = 1 op vs 2), "particularly useful for names." JARO - position-tolerant char matching, good when all chars equally important "e.g. ID numbers." JARO-WINKLER adds a prefix bonus (up to 4 chars), best for names/strings where the prefix is reliable; example MARTHA vs MARHTA = 0.961 (Jaro 0.944) - but "use with caution... especially with short strings" where no common prefix exists. JACCARD / TOKEN-SET - set overlap of tokens, ignores word order, best for multi-word strings (addresses, merchant descriptors with reordered/extra tokens). TF-IDF COSINE - token vectors weighted so rare tokens dominate, good for longer noisy text and as the cheap canopy distance. EMBEDDINGS (Sentence-BERT) - capture SEMANTIC not just syntactic similarity ("AMZN" ~ "Amazon"); string methods "can only capture syntactic not semantic similarity." Practical guidance: use exact/numeric comparators on amount and date (the high-signal fields), string comparators only on the merchant/description text.

SCORING / CLASSIFICATION: weighted-sum rules (assign confidence by how many criteria relaxed) are simplest; logistic regression learns weights from labels; FELLEGI-SUNTER probabilistic matching is the principled standard - per feature define m = P(agreement | true match) (data quality, e.g. ~0.98 for DOB) and u = P(agreement | non-match) (coincidence/cardinality, e.g. ~0.005 for a rare surname). Match weight per feature = log2(m/u); total match weight = log2(lambda/(1-lambda)) + sum of feature weights (assumes feature independence, so weights are ADDITIVE). Convert to probability: P(match) = 2^M / (1 + 2^M). Reference points: weight 0 -> p=0.5, weight 4 -> p~0.95, weight 7 -> p~0.99. m/u can be estimated unsupervised via EM (no labels needed), which is why Splink/fastLink are attractive when you lack labeled duplicates.
- **Reconciliation / UX:** Threshold/auto-vs-suggest design from Fellegi-Sunter and Splink: classify each pair into THREE zones using an upper threshold T_lambda and lower threshold T_mu: above upper = auto-MATCH, below lower = auto-NON-MATCH, between = INDETERMINATE -> send to human/clerical review. Crucially, "thresholds are policy choices, not statistical facts" - Fellegi-Sunter lets you set the two thresholds to directly control the false-positive rate (mu) and false-negative rate (lambda), trading review volume against error rate (tightening the band sends more pairs to review but reduces auto-merge errors). Validation method: clerically label a sample of pairs across thresholds (including below cutoff) to estimate the actual FP/FN at each candidate threshold, then pick the threshold that hits your error budget. For a consumer app this maps cleanly to: auto-merge only very high confidence (e.g. exact amount + exact date + high description similarity = the "100% / amount+date+reference exact" tier in reconciliation writeups), SUGGEST/ask the user for the middle tier (amount + date +/-1 day + name similarity ~90%), and never auto-merge the relaxed tier (amount +/-10%, date +/-3 days). Always make merges reversible (store the comparison vector + weights so a merge can be explained and undone), since indeterminate auto-decisions will sometimes be wrong. Specific numeric auto-merge thresholds for named consumer aggregators are NOT publicly documented.
- **Takeaways:**
  - Always block before scoring: full O(n^2) comparison is infeasible. For transactions the cheapest high-precision block is exact amount + a date bucket, because genuine duplicates almost always agree on amount; add a second blocking pass on rounded-amount + wider date window to recover near-duplicates (pending vs posted).
  - Match the comparator to the field: use exact/numeric comparison on amount and date (your highest-signal fields) and reserve fuzzy string comparators for the merchant/description text only. Do not waste fuzzy logic where exact equality is the right test.
  - For short noisy merchant strings, Damerau-Levenshtein (handles typos + transpositions) or Jaro-Winkler (prefix-weighted, good when the start of the name is reliable) beat plain Levenshtein; use token-set Jaccard when descriptors have reordered/extra tokens, and TF-IDF cosine when rare tokens should dominate. Jaro-Winkler is unreliable on very short strings with no shared prefix.
  - Fellegi-Sunter gives the cleanest mental model: per feature, match weight = log2(m/u), total weight is additive across features, and P(match) = 2^M/(1+2^M). Anchor your UI thresholds to the probability mapping: weight 4 ~ 0.95, weight 7 ~ 0.99. m/u can be learned unsupervised via EM, so you do not need a labeled duplicate set to start.
  - Adopt three zones, not a single cutoff: auto-merge above an upper threshold, ignore below a lower threshold, and route the indeterminate middle to a user review/suggest step. The thresholds are policy choices that directly trade review volume against false merges.
  - Validate thresholds with a small clerically-labeled sample of pairs spanning the score range, then pick the cutoffs that meet your false-positive budget. Do not hardcode magic numbers without measuring.
  - Distinguish three different linkage problems and do not collapse them: 1:1 duplicate (same sign, same source) -> dedup; opposite-sign equal-amount across two owned accounts -> transfer link; one large payment = sum of many purchases -> one-to-many aggregate link. Same scoring machinery, different candidate generation and different output (merge vs link vs annotate).
  - Link rather than collapse for provisional rows: pending/hold and posted/settled versions of the same charge should be linked and reconciled, not silently merged into one row, because amount or date can shift on settlement.
  - Hebrew/transliteration is hard for edit-distance and phonetic methods: Soundex/Metaphone are English-pronunciation-bound and 'disastrous' on non-Latin scripts; transliteration explodes one name into thousands of variants. Prefer matching in the original script and/or aggressive normalization (strip RTL marks, niqqud/diacritics, unify final-letter forms) before comparison, and lean on amount+date signals rather than the Hebrew string when possible.
  - Embeddings (Sentence-BERT) add SEMANTIC matching that string metrics cannot (e.g. 'AMZN' ~ 'Amazon Marketplace'); they are most useful as a fast vector-similarity BLOCKER to generate candidates (Ditto reported ~3.8x pipeline speedup) and as one more comparator feeding the score, not as a wholesale replacement for the transparent, auditable weighted/Fellegi-Sunter scorer.
  - Every auto-decision must be explainable and reversible: persist the per-pair comparison vector and per-feature weights so a merge can be shown to the user and undone. This is essential because the indeterminate band will produce occasional wrong merges.

### Quicken Simplifi + Quicken Classic. Official help docs reviewed: Simplifi "How Do Transfers Work?" (support.simplifi.quicken.com/en/articles/3352152), "How Credit Card Payments and Transfers Are Handled in the Spending Plan" (.../5142302), "How to Resolve Duplicate Transactions" (.../4901071), "Amount Matching for Recurring Transactions" (.../9174873), "Reconciling Accounts in Quicken Simplifi" (.../8218379), "Managing Transactions" (.../3348103), "Account to Account Transfers (A2A)" (.../9980256). Quicken Classic docs: "Handling Downloaded Transactions" (quicken.com/support/handling-downloaded-transactions), "Quicken Downloads Transactions Which Are Duplicates of Existing Register Entries" (quicken.com/support/quicken-downloads-transactions-which-are-duplicates-existing-register-entries), "Duplicate Transactions or Accounts Downloaded in Quicken Mac" (quicken.com/support/duplicate-transactions-or-accounts-downloaded-quicken-mac), "Match your transactions" (info.quicken.com/mac/match-your-transactions). Date-window figure ("one week in the past, two weeks in the future") corroborated by Quicken community threads (community.quicken.com) but not on an official help page.

- **Transfer detection:** Both products auto-detect transfers between owned accounts, but the mechanics differ.

SIMPLIFI: "Quicken Simplifi automatically detects transfers between accounts." When a transfer is detected/categorized, the Category field shows the OTHER account's name (not a normal expense category), and a blue "Go to other side" link jumps to the matched transaction in the paired account. A "Linked Transfer" connects two real transactions: one showing money leaving account A and one showing it arriving in account B. If a user manually categorizes a transaction's Category as a destination account, Simplifi "will try to link it to the matching transaction in that account"; if none exists, it "will automatically create the transaction" on the other side. The exact auto-detection criteria (amount tolerance, date window, payee rules) are NOT publicly documented in Simplifi's help center.

QUICKEN CLASSIC: Transfers are modeled by putting a bracketed account name in the Category field (e.g., [Checking]). When both sides of an inter-account transfer download, Quicken links them so the pair is counted once. Auto-match uses date + payee + amount within a date window (see dedupPrevention).

DATA-MODEL NOTE for our design: Simplifi keeps TWO separate transaction rows (one per account) joined by a link/pointer ("Go to other side"), rather than a single shared row. Each side can be independently included/excluded from the Spending Plan, which requires both rows to exist and carry their own flags.
- **Credit-card payment matching:** Simplifi's core principle: "Each dollar spent should be counted once - when you make the purchase, not when you pay for it later." A credit-card payment is treated as a Transfer (moving funds from checking to the card), so it is "neither an income nor an expense" and is "excluded from the Spending Plan by default... because you're simply moving funds from one account to another, which does not change your net worth." This is what prevents double-counting: the individual purchases on the card register count as spending; the later bill payment is a transfer and does NOT re-count.

Two mechanisms exist:
1. Built-in special categories "Credit Card Payment" and "Transfer" - keep a transaction neutral WITHOUT requiring a matching transaction in another account (useful when the other account is not tracked in Simplifi). These are excluded from the Spending Plan and shown greyed-out in an "Excluded this month" section.
2. Linked Transfer - when both the checking account and the credit card account are tracked in Simplifi, the payment is linked between them. For linked transfers the user can selectively include just one side, or both, in the Spending Plan for flexibility.

Quicken Classic relies on the same transfer concept: a payment categorized as a transfer to the credit-card account nets to zero across accounts so the bill payment is not counted on top of the purchases.
- **Internal linking / data model:** SIMPLIFI data model: a transfer = two linked transaction records (one per account), bound by a link that powers the "Go to other side" navigation. Linking happens by (a) auto-detection, or (b) user setting one transaction's Category to the other account, which triggers a search for a matching transaction in that account and, if none found, auto-creation of the counterpart. Both sides carry independent "Exclude from Spending Plan" flags. Crucially, state propagates across the link: "If you apply a split to a pending transfer transaction in one account, the corresponding transfer in the other account will also be marked as Pending" - i.e., status/edits on one side cascade to the linked side.

QUICKEN CLASSIC data model: the transfer is encoded inline via a bracketed account reference in the Category field (e.g., [Savings]). When the counterpart downloads, the bracketed link ties the two register entries together so they net out. Account-to-account integrity relies on this category convention rather than a separate join record.

Newer "Account to Account Transfers (A2A)" in Simplifi is a feature for initiating real money movement, distinct from the categorization/linking model above.
- **Dedup + matching heuristics:** PRIMARY KEY for dedup is the bank-provided unique ID, not a heuristic. Quicken stores the Financial Institution Transaction ID (FITID), surfaced in the register as the "Downloaded ID" column (FITID column on Mac). "It is used by Quicken to determine which transactions have been downloaded and which ones need to be downloaded." A transaction whose FITID was already downloaded is not re-imported. Duplicates from aggregation occur mainly when this ID breaks: (a) the bank CHANGES its FITID format, so old transactions return with new IDs and "Quicken has no way of knowing that they're actually duplicates"; (b) reactivating an account re-downloads "the most recent 90 to 200 days of transactions (depending on the financial institution)"; (c) mixing download methods (in-app download vs manual file import from the bank site) yields different Downloaded IDs for the same transaction. Guidance: "do not mix your methods for getting transactions from your bank."

SECONDARY heuristic match (downloaded-vs-register, e.g., user pre-entered a transaction or a scheduled reminder): Quicken matches on "Date + Amount + Payee" - "The payee is the same or similar. The date is within a few days of the scheduled date. The amount matches or is close to the scheduled amount." The exact official window is stated only as "within a few days"; Quicken community threads (not official help) cite the auto-match window as roughly "one week in the past to two weeks in the future" of the downloaded transaction, matching on the downloaded POSTING date which must be the same or earlier than the register date.

CONFIDENCE / AUTO vs SUGGEST: Downloaded transactions get a status of New (no match), Matched (auto-matched, ready to Accept), or are presented for manual matching when auto-match fails. Quicken does not publish numeric confidence thresholds; matching is binary auto-match-or-not, then user-confirmed via Accept. Mac distinguishes only "Automatic match" vs "Manual match."

SIMPLIFI: no automatic duplicate prevention/resolution is documented beyond the FITID-style dedup; resolving a leftover duplicate is fully manual. A duplicate that is bank-downloaded shows "Appears on your [account] statement as..." in the Transaction Detail; a manual entry lacks that line - this is the user's signal for which to delete.

RECURRING/BILL amount matching (separate from raw import dedup): Any Amount (match by payee only), Exact Amount (zero variance), or Limited Range = "a 30% variance (15% above and 15% below) around the set amount." This is a concrete documented tolerance and is the only published numeric matching threshold across either product.
- **Reconciliation / UX:** QUICKEN CLASSIC: Real reconciliation exists. Workflow is "Compare to Register": after download, the user reviews each transaction and chooses Accept / Edit / Delete. "Accept All" bulk-accepts; "Undo Accept All" reverses a batch (available only until Quicken is closed or the next account update, and NOT usable for individually-accepted transactions). Cleared/reconciled state is tracked in the Clr column (c = cleared, R = reconciled). If the Quicken balance matches the online balance, accepted transactions can be auto-reconciled by stamping "R" in the Clr column. Manual matching fixes (right-click, Transactions menu, or drag-and-drop) handle cases where auto-match failed or matched the wrong entry; for an N-to-1 match Quicken creates a split with a line per selected transaction plus a difference line.

SIMPLIFI: No traditional statement reconciliation. Instead there is a "reviewed" column (and a separate "flagged" column) - the user marks downloaded transactions as reviewed while comparing against the bank statement to confirm transactions and balance match. Balance discrepancies are handled via a dedicated "Resolve Balance Discrepancies" guide.

CORRECTION / EDIT / SPLIT UX (Simplifi): inline edit of Date/Payee/Category/Amount directly from the list; full edit via the 3-dot Transaction Detail; bulk edit via checkboxes + pencil ("choose properties to change" then Apply); split into multiple categories/tags via the "Split" button with "Divide among Splits" for even distribution (splits cannot have separate dates); per-transaction and per-split "Exclude from Spending Plan" and "Exclude from Reports" flags. Duplicate resolution: merge a manual + downloaded pair (select both, click merge icon, confirm - WEB APP ONLY; mobile users must delete one). Support can only investigate duplicate issues "back 30 days."
- **Takeaways:**
  - Make the bank's unique transaction ID (FITID-equivalent) the primary dedup key, not a fuzzy heuristic. Quicken's whole import-dedup model rests on a stored Downloaded ID/FITID; heuristic matching is only the fallback for user-entered or scheduled transactions.
  - Plan for the FITID breaking. The dominant real-world duplicate cause is the institution changing its ID format or re-sending old transactions on reactivation (90-200 days). Add a secondary heuristic dedup layer (amount + date-window + normalized payee) as a safety net behind the ID match.
  - Model a transfer as TWO linked records (one per account) joined by a pointer, not one shared row. This is what lets Simplifi show 'Go to other side' and lets each side be independently included/excluded from budgets. Cascade status changes across the link (Simplifi marks both sides Pending together).
  - Treat credit-card payments as transfers and exclude them from spending by default, on the principle 'each dollar counted once - at purchase, not at payment.' This single rule prevents the most common double-count without special-casing.
  - Support 'neutral' categories (Transfer / Credit Card Payment) that zero-out a transaction WITHOUT requiring a matching record. Essential when the counterparty account is not tracked - avoids forcing users to add every account just to silence a transfer.
  - Use a small asymmetric date window for heuristic matching, biased toward the future (Quicken community figure: ~1 week past to ~2 weeks future), and match against the bank's POSTING date which should be on/after the user-entered date. Pending-to-posted timing makes the future side wider.
  - Offer explicit amount-matching modes rather than one fixed tolerance: Any Amount (payee-only, for variable bills like utilities/CC), Exact Amount (zero variance), and a bounded range (Simplifi uses +/-15%, a 30% band). Let the user pick per recurring payee.
  - Status-driven review beats silent auto-merge: classify each import as New / Matched and require an Accept step, with bulk Accept-All plus an Undo-All escape hatch scoped to the current session. Users want to see and reverse matches.
  - Give a clear provenance signal for each transaction (Simplifi's 'Appears on your statement as...' shows bank origin vs manual entry). When a duplicate must be resolved manually, this tells the user which record is safe to delete.
  - Provide a merge action for manual+downloaded pairs (not just delete), so a pre-entered transaction inherits the downloaded ID and stops re-duplicating. Quicken's failure mode is exactly when a manual entry never gets linked to its download.
  - Decide reconciliation depth deliberately: full reconcile (cleared 'c' / reconciled 'R' states, auto-reconcile when computed balance == online balance) like Quicken Classic, or lightweight 'reviewed/flagged' columns like Simplifi. Even the light version needs a balance-discrepancy resolution path.
  - Numeric matching thresholds are mostly undocumented in both products - only the recurring-amount +/-15% band is published. Don't assume there is a sophisticated confidence score; the observable behavior is binary auto-match-or-suggest, then human confirm.

### Copilot Money (copilot.money). primary sources are the official Help Center (help.copilot.money) plus credible reviews. Pages used: Transaction Types (https://help.copilot.money/en/articles/3971267-transaction-types), Credit Card Payment Transactions (https://help.copilot.money/en/articles/10671434-credit-card-payment-transactions), Creating Manual Internal Transfer Payments (https://help.copilot.money/en/articles/4235839), Creating Manual Transactions (https://help.copilot.money/en/articles/4038706), Excluding Transactions (https://help.copilot.money/en/articles/9718801), Transactions FAQ (https://help.copilot.money/en/articles/10761907), Troubleshooting Account Duplicates (https://help.copilot.money/en/articles/8663179), Clearing Local Cache (https://help.copilot.money/en/articles/9922978), Apple Card/Cash/Savings (https://help.copilot.money/en/articles/9038131), Copilot Intelligence for Spending (https://help.copilot.money/en/articles/8182433), and Money with Katie review (moneywithkatie.com).

- **Transfer detection:** Copilot has a first-class transaction TYPE for transfers called "Internal Transfer" (one of three types: Regular, Income, Internal Transfer). Per docs: "Money you move between accounts, such as paying a credit card bill, is considered an Internal Transfer. These transactions are also excluded from your spending budgets." Detection: "Internal Transfer transactions should automatically be captured in your account transaction data", i.e. when BOTH legs come from linked/connected accounts, Copilot classifies them as Internal Transfer automatically (and tells users to contact support "if you are missing transactions"). KEY DATA-MODEL FINDING: Copilot does NOT model a transfer as one linked record with two legs. It treats each side as a separate, independent transaction, each typed as an Internal Transfer (an "Outgoing Internal Transfer" on the source account and an "Incoming Internal Transfer" on the destination). For manual accounts the user must create both: "You would need to post two manual transactions: 1. Outgoing Transfer from the checking account. 2. Incoming Transfer to the savings account." Copilot does NOT auto-create an offsetting leg. Users can reclassify via the transaction menu ("Transfer" -> "Incoming"/"Outgoing" + choose the destination/source account), and can opt to "apply the same change to similar transactions." There is NO publicly documented amount/date matching window, fuzzy-match heuristic, or confidence threshold for PAIRING the two legs, the mechanism for how (or whether) it relationally links the two records is not publicly documented. The exclusion-from-budget effect is achieved purely by the TYPE on each transaction, not by detecting a matched pair. The Venmo integration is a special case where Copilot deterministically marks all bank-recorded incoming/outgoing Venmo transactions as Internal Transfers after Venmo setup.
- **Credit-card payment matching:** There is no automatic "matching" of a CC bill payment to its underlying purchases, and crucially that matching is unnecessary in Copilot's model because of how the types work. A credit card bill payment is just a money movement between two owned accounts, so both legs are typed Internal Transfer and thus excluded from budgets, while the individual card PURCHASES (Regular transactions) are what count toward spending. Per docs, a CC payment is two transactions: "the outgoing transaction from the checking account" and "the incoming transaction to your credit card," and "If these credit card payments are paying off your monthly balance, you'll want to leave the transactions from your checking account and credit card account as Internal Transfers, because that money is already accounted for in your budget with your individual transactions as they occur." Special historic-balance handling: if you're paying off an OLD balance (purchases predating Copilot, never budgeted), you change the checking outflow to "Regular" so it counts as spend, but "You should still leave the incoming transaction to your credit card as an Internal Transfer" to avoid double counting. Whether Copilot AUTO-types CC payments as Internal Transfer vs requiring the user to set it is not explicitly documented (the article only says what users "should" do; Copilot Intelligence may suggest the type but there's no documented auto-detect-and-pair of the two payment legs). No matching window/amount tolerance documented for CC payment legs.
- **Internal linking / data model:** Account-linking is via a third-party data aggregator (Plaid-style connections) per account; accounts are also supported as fully MANUAL accounts. Transfers are NOT represented as a single double-entry record linking two accounts. Instead each account holds its own transaction rows, and a transfer is two independent rows each carrying the Internal Transfer type. There is no documented foreign-key/relational pairing between the two legs that the user-facing docs expose, pairing as a data-model concept is "not publicly documented." Transaction-type taxonomy is explicit and small: Regular, Income, Internal Transfer; list view shows badges [R] Recurring, [I] Income, [T] Internal Transfer. "Excluded" is a separate orthogonal concept implemented via categories (a category can be flagged type "Excluded"), so exclusion is a property of the assigned category, not a boolean flag on the leg itself. ML categorization runs a PER-USER private model (each user gets their own model; data never leaves Copilot's systems).
- **Dedup + matching heuristics:** Copilot has NO publicly documented automatic at-import dedup/fuzzy-matching engine (amount + date-window + name similarity). Duplicates are treated as an exceptional, mostly aggregator-driven problem rather than something silently deduped. Documented causes: (1) deleting and reconnecting the same account where old transactions weren't removed ("a data caching issue ... usually caused by deleting and reconnecting the same account, but the transactions were not removed properly from the deleted copy"); (2) the aggregator rotating account IDs, "When details of an account change ... the data aggregator marks the original account ID as closed and generates a new account ID," producing a duplicate account; (3) re-issued cards with new last-4 digits; (4) user accidentally creating a duplicate connection; (5) manual+connected overlap (esp. Apple Cash importing historic data). Remedies are largely manual/support-driven, NOT algorithmic: clear the local cache (Settings > Advanced/Account > Clear local cache), and for account-level dupes "without making any edits to the accounts, please contact the Copilot team via the in-app chat" (support does a merge that preserves history). For Apple Cash overlap, the fix is upstream: set iPhone Settings > Privacy & Security > Wallet > Copilot > Activity to "Starting Today" or "Starting 30 Days Ago." The only "smart"/confidence-thresholded ML is for CATEGORY (and suggested type) prediction, not for dedup or transfer-pairing.
- **Reconciliation / UX:** User correction is via the transaction detail/menu: change the transaction TYPE (Regular / Income / Internal Transfer, with Outgoing/Incoming + account selection for transfers), change CATEGORY (tap category -> pick or create one, including toggling a category to type "Excluded"), and a "Exclude" option directly in the category list. When changing type/category, Copilot offers to "apply the same change to similar transactions" (a bulk/rule-style action), and you can create exact or partial transaction-NAME matching RULES so future matching transactions get the same treatment, this is the closest thing to a documented matching heuristic, and it's name-based and user-defined, not automatic. Excluded transactions: removed from spending totals across the app by default, but Cash Flow has a toggle to "add your excluded transactions in your total spend amount" (and then they also show on Dashboard); you can filter to view Excluded in the Transactions tab. Limitation: "We don't currently support marking a Recurring transaction as excluded." Manual transactions can be created/edited; deleting/reconnecting accounts is discouraged as a fix (it causes duplicates), support-assisted merge is preferred. Copilot Intelligence learns from each correction (model improves as you review more; surfaces top-2 guesses for quick re-categorization). No explicit documented "undo" command beyond editing the transaction back.
- **Takeaways:**
  - Model transfers as a TYPE on each leg, not as a matched pair. Copilot's whole approach is to type both sides 'Internal Transfer' and exclude that type from budgets, this sidesteps the hard problem of pairing legs and is robust even when only one side is linked. Consider an enum transaction type {Regular, Income, Transfer} plus an orthogonal 'excluded' flag (Copilot puts excluded on the CATEGORY, which is a clean way to make exclusion reusable via rules).
  - Avoid CC double-counting by typing the BILL PAYMENT as a transfer (excluded) while keeping the individual PURCHASES as spend. The purchases are the source of truth for budgeting; the payment is just money movement. No need to reconcile a payment against N purchases.
  - Have an explicit escape hatch for the historic-balance edge case: paying an old, never-budgeted balance should let the checking outflow count as spend (Regular) while the card-side credit stays a transfer. Build a per-leg type override, not just a pair-level toggle.
  - Make type/category changes propagate via user-defined name-matching RULES (exact or partial) and an 'apply to similar transactions' prompt. This gives users dedup/classification control without a risky fully-automatic engine.
  - Copilot does NOT auto-dedup at import; it treats duplicates as aggregator/reconnect artifacts and leans on a manual merge + 'clear local cache.' Lesson: design your ingest to be idempotent (stable composite hash, like this project already does) so reconnects don't spawn dupes, that's exactly the failure mode Copilot suffers from.
  - Beware aggregator account-ID churn (a connection's ID rotating creates a phantom duplicate account). Key off a stable account identity, not the raw provider account ID, and provide a merge flow that preserves history.
  - Beware manual+connected overlap producing duplicate transactions (Copilot's Apple Cash case). If you support both manual and scraped versions of the same account, give users a clean cutover (close/keep history on one) and a date-cutoff on imports.
  - Separate the ML categorizer from dedup/transfer logic. Copilot's ML only predicts category/type, with a confidence gate ('if not very confident ... it won't apply it'), a warm-up threshold (30 reviewed transactions before predictions turn on), a per-user private model, and a suggest-vs-auto UX (Intelligence badge + top-2 guesses). Pairing/dedup is deterministic, not ML, a good separation of concerns.
  - Use clear, lightweight UI signifiers for type so users can audit at a glance (Copilot's [R]/[I]/[T] badges). Transparency builds trust that auto-classification didn't silently hide money.
  - Pairing the two legs of a transfer (relational linking with amount/date-window/fuzzy matching) is NOT publicly documented in Copilot, meaning even a polished commercial app gets away WITHOUT true leg-pairing by relying on per-leg typing + user rules. You don't have to build hard two-sided matching to ship something good; start with per-leg typing and rules, add suggested-pair detection later.

### YNAB (You Need A Budget) official docs. Primary sources: YNAB API / OpenAPI Transaction schema (https://api.ynab.com/v1 and api.ynab.com/papi/open_api_spec.yaml; field mirror https://github.com/dmlerner/ynab-api/blob/master/docs/TransactionDetail.md); Transfer Transactions guide (https://support.ynab.com/en_us/transfer-transactions-a-guide-HJOsZz4Jj); Credit Card Payments guide (https://support.ynab.com/en_us/credit-card-payments-a-guide-r1_506Q1j) and Handling Credit Cards overview (https://support.ynab.com/en_us/handling-credit-cards-overview-ry7cNub1s); blog "How to Manage Credit Cards" (https://www.ynab.com/blog/how-to-manage-credit-cards-in-ynab); Approving & Matching Transactions (https://support.ynab.com/en_us/approving-and-matching-transactions-a-guide-ByYNZaQ1i) and blog "Manually Match Transactions" (https://www.ynab.com/blog/matchmaker-matchmaker-make-me-a-match); Reconciling Accounts guide (https://support.ynab.com/en_us/reconciling-accounts-a-guide-BJFE3fHys) and blog "8 Myths About Reconciliation" (https://www.ynab.com/blog/8-myths-about-reconciliation-in-ynab). NOTE: the support.ynab.com article bodies are JS-rendered and could not be fetched verbatim; details below come from the API spec (authoritative for data model), the official blog (static), and search snippets quoting the guides. Where a precise value is not in those, it is flagged "not publicly documented."

- **Transfer detection:** A transfer is a first-class, explicitly-modeled concept, not inferred by a heuristic. The user (or import) picks a payee of the form "Transfer: [Account Name]". This creates TWO paired transaction records, one in each account (equal and opposite milliunit amounts). The data model makes the pairing explicit: every TransactionDetail has `transfer_account_id` ("If a transfer transaction, the account to which it transfers") and `transfer_transaction_id` ("If a transfer transaction, the id of transaction on the other side of the transfer"). So a transfer = two rows cross-linked by id, each pointing at the counterpart account. Editing/deleting one side updates/removes the other (they are kept in sync because they are linked, not independent). KEY DESIGN POINT for double-counting: a transfer between two ON-BUDGET ("Budget") accounts is NOT given a category and is invisible to the budget/spending math, because the money has not entered or left the budget. Per YNAB: "you still have a total of $800. You don't have any additional nor any fewer dollars; nothing is happening in the Budget portion of YNAB" (eshmoneycoach quoting YNAB principle); it's "like taking $20 out of your wallet and putting it in your pants pocket." Conversely, a transfer involving a TRACKING (off-budget) account DOES require a category, because money is genuinely entering or leaving the budget at that boundary (that category-assigned leg is the legitimate inflow/outflow). On import (Direct Import / linked accounts), both legs can arrive separately; YNAB's matching engine pairs the imported entry to the existing manual transfer transaction on the same account so you don't get duplicates. This avoids double-counting by construction: an on-budget-to-on-budget transfer simply never hits any spending category, so it can never be summed as spending or income.
- **Credit-card payment matching:** A credit card payment is modeled as a TRANSFER from the funding account (e.g. checking) to the on-budget credit card account, NOT as a categorized expense. This is the central anti-double-counting mechanism. Mechanics: (1) When you record a PURCHASE on the credit card, you categorize it normally (e.g. "Dining Out"). YNAB then AUTOMATICALLY moves that same dollar amount out of the spending category and into the auto-created "Credit Card Payments" category for that card ("YNAB automatically moves the dollars in your categories" into the payment category; a $33 Fun Money purchase triggers $33 into the card's payment category). So the spend is counted once (in Dining Out / Fun Money) and the payment category just holds the reserved cash to settle the card. (2) When you PAY the card, you record a payment ("Record Payment" / or enter a transfer from checking with payee "Transfer: [Credit Card]"). "YNAB updates both your checking account and credit card account screens" - it writes the paired transfer (linked via transfer_account_id/transfer_transaction_id). Because the payment is a transfer (no spending category), it is never summed as new spending. Double-counting is impossible: the real expense was categorized at purchase time; the payment merely moves already-set-aside money to retire the card balance. On import, the bank's outflow on checking and the bank's payment-credit on the credit card account are matched to the single user-entered transfer (one on each side), preventing the payment from appearing twice.
- **Internal linking / data model:** Data model (from official YNAB API / OpenAPI TransactionDetail schema): each transaction row carries `account_id`, `payee_id`/`payee_name`, `category_id` (nullable - transfers between budget accounts have no category), `amount` (milliunits, signed), `cleared` (enum: cleared / uncleared / reconciled), `approved`, `deleted`. Linking fields: `transfer_account_id` = "If a transfer transaction, the account to which it transfers"; `transfer_transaction_id` = "If a transfer transaction, the id of transaction on the other side of the transfer"; `matched_transaction_id` = "If transaction is matched, the id of the matched transaction" (used for import-to-manual matching, distinct from transfer pairing). So YNAB has TWO distinct linking relationships: (a) transfer pairing (two real, persisted rows, one per account, mutually referencing) and (b) import matching (an imported row matched/merged to a pre-existing user-entered row). Credit cards are modeled as a special on-budget account type that auto-spawns a dedicated "Credit Card Payments" budget category; the transfer-payee + payment-category pair is what ties spending, reserved funds, and payment together. Off-budget/"Tracking" accounts are the escape hatch: transfers crossing the budget boundary into/out of them must be categorized.
- **Dedup + matching heuristics:** Two layers, both documented in the API. (1) DETERMINISTIC dedup via `import_id`: "If specified, a new transaction will be assigned this import_id and considered 'imported'." File-Based / Direct Import assign import_id in the format `YNAB:[milliunit_amount]:[iso_date]:[occurrence]` - e.g. a -$294.23 txn on 2015-12-30 becomes `YNAB:-294230:2015-12-30:1`, and a second identical-amount-same-date txn becomes `...:2`. If a transaction with an import_id already present on that account is sent again, "it will be skipped to prevent duplication," and the skipped import_id(s) are returned in a `duplicate_import_ids` list. Important caveat: if you send two transactions with the SAME import_id, the latter is ignored as a duplicate "even if the data are different" - so the occurrence counter is what disambiguates legitimate same-amount/same-day repeats. (2) FUZZY matching to user-entered rows: an imported transaction is matched to an existing "user-entered" transaction "on the same account, with the same amount, and with a date +/-10 days from the imported transaction date." This is the documented matching window: SAME ACCOUNT + EXACT AMOUNT + DATE WITHIN +/-10 DAYS. Auto-vs-suggest: when criteria are met, YNAB auto-matches (merges) and surfaces it for one-click approval ("approve the transaction using the normal flow we've always had for automatically matched transactions"); when auto-match misses, the user can MANUALLY match by selecting exactly two transactions and Edit > Match. Constraints on matching: amounts must be equal ("transactions with different amounts really don't match"); "Two imported transactions can't be matched" and "two user-entered transactions can't be matched either" - matching is strictly imported<->user-entered. No fuzzy-amount or payee-similarity threshold is publicly documented; matching is exact-amount + 10-day-window based, not a confidence score.
- **Reconciliation / UX:** Reconciliation = comparing YNAB's CLEARED balance to the bank's cleared balance so they "match to the penny." Three transaction states, surfaced as a status column: gray "c" = uncleared (not yet seen/cleared at bank); green "c" = cleared but not yet reconciled; green LOCK = cleared AND included in a prior reconciliation (locked). Locking is the integrity mechanism but is not rigid: "You can edit locked transactions if you need to, just be sure to re-reconcile after." When YNAB's cleared balance does not equal the bank's, YNAB offers to create a RECONCILIATION BALANCE ADJUSTMENT transaction: "A balance adjustment will represent those missing or incorrect transactions for you" so the user can move on without hunting every discrepancy. Recommended cadence: weekly (at least every other week) so discrepancies stay small/findable. Approval workflow is separate from clearing: imported transactions land as "unapproved by default" (`approved=false`) and require user Approve; matched imports are presented for approval too. Correction/undo: edits to locked reconciled rows are allowed (then re-reconcile); transfers and CC payments can be corrected by editing either paired row (the linked side updates); deletion is soft - the API notes "Deleted transactions will only be included in delta requests," implying tombstoning rather than hard delete (supports sync/undo).
- **Takeaways:**
  - Model transfers as TWO explicit, mutually-linked rows (one per account) rather than a single record or a post-hoc heuristic. YNAB stores transfer_account_id + transfer_transaction_id on each side. Editing/deleting one side propagates to the other. This makes transfers a first-class type, not a guess.
  - Kill double-counting at the schema level, not in reporting: a transfer between two owned (on-budget) accounts gets NO spending category, so it is structurally impossible to sum it as spend or income. Only transfers that cross the budget boundary (to/from off-budget 'tracking' accounts) get categorized.
  - Model a credit-card payment as a transfer (checking -> card account), never as an expense. The expense is counted ONCE at purchase time (categorized); the payment just moves already-reserved money. For an Israeli aggregator this directly solves the 'CC bill payment vs the underlying card purchases' double-count problem.
  - Auto-reserve funds for liabilities: when a card purchase is categorized, automatically move that amount into a dedicated 'Credit Card Payment' bucket. This keeps the spend visible in its real category while tracking what is owed - a clean separation worth mirroring for Israeli credit (e.g. Isracard/CAL monthly billing).
  - Use a deterministic, idempotent import key for dedup: YNAB's import_id = `YNAB:[milliunit_amount]:[iso_date]:[occurrence]`. The occurrence counter disambiguates legitimate identical same-day/same-amount charges (very common with cards). Re-sending a known import_id is skipped and reported back in duplicate_import_ids. This is essentially YNAB's version of our dedup hash - note our dedup.ts also uses count-based dedup, which aligns well.
  - Have a SECOND, fuzzy layer to merge imported rows into pre-existing manual ones: YNAB's documented rule is same account + EXACT amount + date within +/-10 days. Exact amount is required (no fuzzy-amount matching is documented); the slack is in the DATE, not the amount - good guidance for choosing a matching window.
  - Separate 'clearing' (matches the bank) from 'approval' (user accepted the import) from 'categorization'. Imports arrive unapproved by default and need a one-click approve; auto-matches are merged but still surfaced for approval. Three independent states (uncleared/cleared/reconciled-locked) give a clean reconciliation UX.
  - Provide a reconciliation escape hatch: when computed balance != bank balance, offer a single 'balance adjustment' transaction instead of forcing the user to find every discrepancy. Lock reconciled rows but keep them editable (with re-reconcile). Soft-delete (tombstone) rows so sync/undo and delta queries work.
  - Matching is strictly imported<->user-entered: never auto-merge two imported rows or two manual rows. This prevents the matcher from collapsing genuinely distinct transactions and bounds the blast radius of bad matches.
  - Offer manual match as the fallback when auto-match fails: let the user pick exactly two transactions and merge them, preserving their chosen category/memo. Don't rely on auto-match alone - bank date/amount quirks (very common with Israeli scrapers) will defeat any fixed window.

### Bank data aggregators (Plaid, MX, Finicity/Mastercard, Akoya) + PFM apps (Monarch, Copilot, Wave). Key official docs:
- Plaid Enrich API: https://plaid.com/docs/api/products/enrich/ and intro https://plaid.com/docs/enrich/
- Plaid Transactions states / dedup: https://plaid.com/docs/transactions/transactions-data/
- Plaid PFC taxonomy: https://plaid.com/documents/transactions-personal-finance-category-taxonomy.csv and blog https://plaid.com/blog/transactions-categorization-taxonomy/ , AI update https://plaid.com/blog/ai-enhanced-transaction-categorization/
- Plaid parsing engine: https://plaid.com/blog/how-plaid-parses-transaction-data/ , https://plaid.com/blog/transaction-enrichment-engine/
- Plaid Transfer reconciliation (money-movement product, distinct from PFM transfer detection): https://plaid.com/docs/transfer/reconciling-transfers/ , flow of funds https://plaid.com/docs/transfer/flow-of-funds/ , reading events https://plaid.com/docs/api/products/transfer/reading-transfers/
- MX Data Enhancement: https://www.mx.com/products/data-enhancement/ , off-platform API https://docs.mx.com/api-reference/more-apis/data-enhancement-off-platform/
- Finicity/Mastercard Data Enrichment: https://www.finicity.com/manage/transactions/ , https://developer.mastercard.com/open-banking-us/documentation/products/manage/data-enrichment/api/
- Akoya Transactions / FDX: https://akoya.com/products/transactions , https://docs.akoya.com/guides/transactions
- PFM apps: Monarch https://help.monarch.com/hc/en-us/articles/360048393292-Transfers-and-Credit-Card-Payments ; Copilot https://help.copilot.money/en/articles/3971267-transaction-types and https://help.copilot.money/en/articles/10671434-credit-card-payment-transactions ; Wave transfer/CC-payment help.

- **Transfer detection:** Two distinct senses of "transfer" exist in this space; keep them separate.

(1) Aggregator transaction classification (closest to our need): Plaid's Personal Finance Category (PFC) taxonomy classifies transfers via top-level primary categories TRANSFER_IN and TRANSFER_OUT (plus LOAN_PAYMENTS, BANK_FEES). Detailed examples: TRANSFER_OUT_ACCOUNT_TRANSFER, TRANSFER_IN_ACCOUNT_TRANSFER, TRANSFER_IN_DEPOSIT, TRANSFER_IN_CASH_ADVANCES_AND_LOANS, TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS. Taxonomy is 16 primary / 104 detailed (PFCv2, Dec 2025 added a dozen+ subcategories for income types, repayments/disbursements, fees, transfers). Each personal_finance_category object has primary, detailed, and confidence_level. IMPORTANT: Plaid classifies a transaction as a transfer-type at the single-transaction level (semantic intent) but does NOT, in public docs, pair the two legs across the user's owned accounts. MX similarly has an "internal transfer" category meaning a transaction between two accounts of the same entity, again as a label, not a documented cross-account pairing.

(2) Actual leg-pairing between two owned accounts is done by the PFM layer, not the aggregator. Documented matching parameters across the industry (per transaction-matching literature and PFM apps): match on amount equal-and-opposite-sign, date proximity (a small window to absorb settlement lag), and description/reference. The exact window and thresholds are NOT publicly documented by Plaid/MX/Finicity/Akoya; PFM apps (Monarch, Copilot) auto-detect candidates and let the user confirm/mark as Internal Transfer. So: aggregators give you a reliable transfer LABEL + stable counterparty; you build the leg-pairing yourself using opposite-sign amount + date-window + same-user-account scoping.

Plaid Transfer (the money-movement product) reconciliation is a different concept: it matches your bank-statement sweep lines to Plaid records via the first 8 chars of sweep_id appearing on the statement (e.g. "PLAID 6c036ea0 CCD"), with event types like swept, swept_settled, return_swept; no amount tolerance window is documented.
- **Credit-card payment matching:** This is treated as the canonical internal-transfer case by PFM apps, and the consistent rule is: classify both legs as Internal Transfer and EXCLUDE them from spending/income so the underlying purchases (already counted on the card) are not double-counted.

- Monarch: transactions categorized as "Transfers" are excluded from budget and spending "so that they are not double counted," explicitly citing credit card payments and moving money between accounts.
- Copilot: detects when funds move from checking to pay a credit card; both the checking-side debit and the card-side credit are left as Internal Transfers, "because that money is already accounted for in your budget with individual transactions as they occur." Internal Transfers are excluded from spending budgets. Copilot auto-marks CC payments as Internal Transfer by default; user can override one leg to Regular if they want to budget the payment itself (rare).
- Wave: a transfer cannot exist without both sides recorded; if you categorize one side as a transfer without a match, Wave auto-CREATES the missing offsetting transaction.

Design implication: the CC bill payment (checking -$X out, card +$X in) must NOT be categorized as spend. Only the individual card purchases count. So the matcher's job is to (a) recognize the bill-payment pair, (b) flag both legs as transfer/excluded, NOT to net them against purchases. Aggregators help by labeling the payment leg TRANSFER_OUT / LOAN_PAYMENTS and providing a financial_institution counterparty, but do not net it for you.
- **Internal linking / data model:** Counterparty / account-linking data model from the aggregators:

- Plaid Enrich counterparties[]: each has name, type (enum: merchant, financial_institution, payment_app, marketplace, payment_terminal, income_source), entity_id (a unique, STABLE, Plaid-generated ID mapping to the counterparty), plus logo_url, website, phone_number. For European institutions only, counterparty can include account_numbers (IBAN, BIC). The financial_institution and payment_app types are the signal that a transaction is account-to-account / P2P movement rather than merchant spend.
- entity_id is the key linking primitive: stable across transactions, so you can group all transactions to/from the same counterparty (e.g., the same brokerage or the same person via a payment app) without string matching. Plaid markets entity_id for "building custom rules or logic for specific merchants/counterparties."
- Akoya/FDX: standardized transaction fields per the Financial Data Exchange spec; enrichment adds three levels of categorization, merchant name/logo/website/location, regularity (recurring), and payment-processor info. FDX provides standard fields (transaction id, status, amount, memo, payee, checkNumber) useful for identifying account movements.

Data-model takeaway for us: model accounts as first-class, and model a "transfer link" as an explicit join between two transaction rows (leg A in account X, leg B in account Y) rather than mutating either row. Store a stable counterparty/entity id per transaction so transfers and recurring streams can be grouped. Scope pairing to accounts owned by the same user.
- **Dedup + matching heuristics:** The strongest, most concrete documented dedup pattern is Plaid's pending-vs-posted model (directly relevant to our overlapping-pull problem):

- Plaid does NOT mutate a pending transaction into a posted one. Instead the posted transaction is a NEW row carrying pending_transaction_id = the transaction_id of the original pending row. Consumers dedup by matching on pending_transaction_id.
- /transactions/sync returns three arrays: added, modified, removed, plus a cursor. When a pending posts, Plaid sends the pending in removed AND the posted in added (with pending_transaction_id set). You must apply all three in order to stay consistent and avoid duplicates.
- Caveats Plaid documents: some institutions (Capital One, USAA) provide no pending data so pending_transaction_id is null; Plaid may also FAIL to match pending↔posted, leaving it absent; and the pending and posted versions "may not necessarily share the same details: their name and amount may change" (e.g., restaurant tip added on settle, gas-station auth hold that vanishes). So amount/name equality alone is unreliable for matching legs.
- Confidence/auto-vs-suggest: Plaid Enrich attaches confidence_level to BOTH personal_finance_category and counterparty, enum VERY_HIGH (>98%), HIGH (>90%), MEDIUM, LOW, UNKNOWN. This is the documented signal to drive auto-apply vs review: auto-apply on VERY_HIGH/HIGH, suggest-for-review on MEDIUM/LOW/UNKNOWN. (Plaid does not publicly document a numeric threshold for transfer LEG-PAIRING specifically, that is our heuristic.)
- MX/Finicity/Akoya use ML + multi-stage cleansing + rule-based logic; specific dedup windows/thresholds are NOT publicly documented.

For our cross-pull dedup: combine a stable composite hash (account + date + amount + normalized description, our existing approach) with the pending/posted insight, since posted versions can differ in name/amount from pending, a pure exact-hash will create duplicates when a pending settles; allow a small reconciliation step (amount-and-date-window) to retire a pending when its posted version arrives.
- **Reconciliation / UX:** User-correction and undo patterns observed:

- Copilot: user selects a transaction and chooses "Mark as Internal Transfer" (or reverts to Regular); is offered to apply the change to similar transactions and/or create a name-based rule (exact or partial match) so future imports auto-classify. Manual internal-transfer pairs can be created explicitly.
- Monarch: duplicates are removed via "Edit multiple"; account-level duplicates are resolved by merging accounts; a transfer tool moves transaction/balance history between accounts (move transactions, balances, or both) when switching data providers for the same institution.
- Wave: if you mark one side as a transfer with no match, it auto-creates the offsetting transaction; both sides must exist for a transfer to be valid.
- Plaid does not provide PFM reconciliation UX; it provides the data (states, confidence) and leaves correction to the app.

Design implications for us: (1) make transfer pairing reversible, an explicit link row that can be unlinked without deleting either transaction; (2) when the user confirms/corrects a classification, offer "apply to similar" + create a persistent rule keyed on normalized description/counterparty; (3) provide a merge/move tool for the data-provider-switch case (same institution re-linked produces parallel accounts/duplicates); (4) treat auto-detection as suggestions for low-confidence matches and only auto-apply high-confidence ones, since amounts/names can legitimately change between pending and posted.
- **Takeaways:**
  - Separate two concepts: aggregators classify a single transaction as transfer-type (Plaid PFC TRANSFER_IN/TRANSFER_OUT, MX 'internal transfer' label), but they do NOT pair the two legs across owned accounts. Leg-pairing is the PFM layer's job and is our responsibility.
  - Use a confidence-driven auto-vs-suggest gate. Plaid Enrich's documented enum is VERY_HIGH(>98%), HIGH(>90%), MEDIUM, LOW, UNKNOWN on both category and counterparty. Mirror this: auto-apply transfer pairing / categorization at high confidence, surface for user review otherwise.
  - Pair transfer legs with opposite-sign equal amount + a date-proximity window + same-user account scope; reference/description as a tiebreaker. The exact window is not publicly documented by any aggregator, so pick a small window (commonly a few days) to absorb settlement lag and make it tunable.
  - Credit card bill payments are the canonical internal transfer: classify BOTH legs as transfer and EXCLUDE from spending/income. Do not net them against purchases. The card purchases are the spend; the payment is just money movement (Monarch and Copilot both do exactly this to prevent double-counting).
  - Model transfer pairing as an explicit, reversible LINK row joining two transaction rows, not by mutating/deleting either leg. This makes unlink/undo and audit trivial and keeps both account ledgers intact.
  - Do not assume the two legs are byte-identical. Plaid documents that pending vs posted versions can differ in name AND amount (tips, auth holds), so dedup and pairing must tolerate small amount/name drift rather than require exact equality.
  - Adopt Plaid's pending/posted dedup mental model: a posted transaction is a NEW record that references the pending one (pending_transaction_id); reconcile by retiring the pending when its posted version arrives. For our count-based hash dedup, add a settlement-reconciliation pass so a settled posted txn doesn't become a duplicate of its pending.
  - Store a STABLE counterparty/entity id per transaction (Plaid entity_id model) so transfers, recurring streams, and 'apply to similar' rules can group by entity instead of brittle string matching. Counterparty.type (financial_institution / payment_app) is a strong transfer signal.
  - Make corrections sticky: when a user confirms or fixes a transfer/category, offer 'apply to similar' and persist a rule keyed on normalized description/counterparty so future imports auto-classify (Copilot's exact/partial name-rule pattern).
  - Provide a merge/move tool for the re-link/provider-switch case. Re-linking the same institution produces parallel accounts and duplicate history; offer moving transactions and/or balance history between accounts and de-duping at the account level (Monarch's pattern).

### Monarch Money official Help Center (help.monarch.com, formerly help.monarchmoney.com) plus credible third-party guides. Primary pages used:
- Transfers and Credit Card Payments: https://help.monarch.com/hc/en-us/articles/360048393292-Transfers-and-Credit-Card-Payments (Last Updated Nov 14, 2025)
- Hiding or Unhiding Transactions: https://help.monarch.com/hc/en-us/articles/4405041904916-Hiding-or-Unhiding-Transactions (Last Updated Dec 16, 2025)
- Creating Transaction Rules: https://help.monarch.com/hc/en-us/articles/360048393372-Creating-Transaction-Rules (Last Updated Jun 4, 2026)
- Troubleshooting Duplicate Transactions: https://help.monarch.com/hc/en-us/articles/32110313427604-Troubleshooting-Duplicate-Transactions (Last Updated Mar 20, 2025)
- Tips & Tricks for Using Monarch: https://help.monarch.com/hc/en-us/articles/28953573066260-Tips-Tricks-for-Using-Monarch
- Third-party guide: https://www.evolvingmoneycoaching.com/avoid-these-mistakes-in-monarch-money-and-an-explanation-on-transfers/
Note: help.monarch.com is behind Cloudflare bot protection (WebFetch returned 403); content was retrieved via a headed browser session, so quotes below are verbatim from the live official pages.

- **Transfer detection:** Monarch's transfer handling is CATEGORY-BASED EXCLUSION, not a two-sided pairing/matching engine. Official definition: "A Transfer in Monarch is when you move money from one of your accounts to another" (e.g., checking to savings, or paying a credit card from a bank account). The mechanism: any transaction whose category is in the "Transfers" group is excluded from budget, cash flow, and spending totals. "Anything categorized under the 'Transfers' category is excluded from your budget and spending so that it is not double counted." Detection of which transactions ARE transfers happens via Monarch's auto-categorization on sync ("Monarch will automatically apply categories to each transaction as it arrives"), which assigns transfer-like transactions (Zelle, Venmo, checks, internal moves) to a Transfers category. There is NO publicly documented algorithm that automatically PAIRS the two sides of a transfer (the outflow on account A with the inflow on account B) using an amount/date matching window. Each leg is independently categorized as a transfer and independently excluded; the exclusion is per-transaction by category, not by detecting a matched pair. A known weakness called out in the official-adjacent guidance: person-to-person payments (Zelle/Venmo/checks) are "often auto-categorized by Monarch as 'Transfers'" even when the money actually left to a third party, so users must manually recategorize those as expenses. Reverse problem also exists: real internal moves can land in the wrong category and need manual fixing. Bottom line for our design: Monarch leans on category semantics + auto-categorization + user rules rather than a confidence-scored transfer-pair detector.
- **Credit-card payment matching:** This is the clearest, best-documented part. Monarch does NOT "match" a credit card payment to specific underlying purchases. Instead it relies on a clean accounting split: (1) the original purchase is recorded immediately as an EXPENSE on the credit card account when the charge posts ("When you place a charge on your credit card (like $50 at a gas station), Monarch tracks that original charge immediately as an expense"); (2) the later bill payment is categorized as a TRANSFER (the special "Credit Card Payment" transfer category), NOT a new expense ("Monarch treats this as a Credit Card Payment (transfer), not a new expense. This is true whether it's a partial payment or the entire balance"). Because the payment sits in an excluded Transfers category, spending is counted exactly once (on the original purchases), never again on the payment. Official worded warning: "Monarch counts the original purchase as spending. Treating the credit card payment as a transfer ensures it's not counted a second time. Otherwise... it would look like you spent $100 instead of $50!" Important nuance: a single bill payment produces TWO transactions that should BOTH be categorized as Credit Card Payment / transfer: "The payment out of your bank account (usually appears as a debit)" and "The payment into your credit card (usually appears as a credit)." So Monarch double-excludes both legs by category rather than linking them. The official accounting/net-worth explanation makes clear the payment does not erase the expense; it only settles the liability. Caveat surfaced in their Pay Down Goals docs: if you ALSO track the same payment via debt Pay Down contributions while categorizing purchases as expenses, you can re-introduce double counting; Monarch tells users to pick one method.
- **Internal linking / data model:** No automatic two-sided transfer link/pair object is publicly documented. Monarch does NOT (per docs) create a persisted "this outflow is matched to that inflow" linked-pair record for ordinary transfers. The data-model primitives that ARE documented and relevant:
1. Category group "Transfers" containing system categories: "Transfer" (general internal moves), "Credit Card Payment" (CC-specific), and, when investments are enabled, "Buy" and "Sell". All are flagged as excluded-from-budget/spending. Users can also create custom transfer categories. So the "is this a transfer" signal is modeled as a category attribute, not a pairing.
2. A per-transaction "hidden" boolean (excludes from list/reports/budget/cash flow but not balances/net worth).
3. Goal linking is the one place explicit linking exists: rules can "Link to goal", "Link to save up goal", and "Link to pay down goal" ("Link transactions from liability accounts to debt paydown tracking"), which associates an individual transaction with a goal. This is the closest documented "link a transaction to something else" data model, but it links transaction-to-goal, not transaction-to-transaction.
4. Account-level merge: duplicate ACCOUNTS can be merged; there is a "Transfer Balance and/or Transaction History to Another Account" tool that moves history between accounts (old account loses data, new gains it), account-level, not transfer-pair-level.
Implication for our design: Monarch's model is "tag each leg with an exclude-eligible category" rather than "store a transfer_pair (debit_txn_id, credit_txn_id)". If we want true pair linking we'd be going beyond what Monarch documents.
- **Dedup + matching heuristics:** Duplicate prevention is largely delegated to the data source and account hygiene, not a documented fuzzy in-app matcher. Official "Troubleshooting Duplicate Transactions" guidance, in order: (1) verify on the bank's own website that the transaction is not actually duplicated there; (2) if it shows as "Pending" it "may be a simple error with the bank or merchant"; (3) confirm you have not added the same ACCOUNT multiple times (duplicate accounts are the main in-app cause) and merge duplicate accounts; (4) only if none of those apply, contact support with institution name, transaction name, date, and amount. So there is NO publicly documented amount/date-window fuzzy dedup heuristic and NO documented auto-merge of two near-identical transactions, and NO confidence/auto-vs-suggest threshold. Related pending behavior: a Preferences setting "Allow edits to pending transactions" exists, but Monarch warns "matching pending transactions to their posted version is not always possible", i.e., they acknowledge pending-to-posted matching is imperfect and is the source of some duplicates (a hidden pending txn "may reappear once the bank processes it... finalized transactions sometimes come through as a new entry"). Manual dedup path: "Edit Multiple" lets users select and delete duplicates in bulk. Net: amount/date/fuzzy matching window for dedup is NOT publicly documented; Monarch treats most dupes as upstream/account-config problems.
- **Reconciliation / UX:** User-correction and "hide from reports" UX is well documented. Marking/unmarking as transfer = recategorize: change a transaction's category into (or out of) the Transfers group via the transaction detail (web: expand with ">" then edit category; mobile: tap transaction). Bulk: "Edit Multiple" (web) / checkmark icon (mobile) to recategorize many at once. Automation: Rules ("Settings > Rules") can auto-set category to a transfer category and/or hide, matched on original statement, merchant name, amount (debit/credit, equals/range), category, account, owner, business; all criteria are AND-combined; multiple statement/merchant conditions are OR-combined; rules run in listed order and can be reordered; rules can be applied retroactively to existing transactions ("apply to X existing transactions"). "Quick rules" widget auto-pops in the lower-right whenever you edit a transaction, letting you turn a one-off correction into a rule. HIDE FROM REPORTS: a separate, independent control from category. "Hiding a transaction does not delete it. It simply removes the transaction from your main transactions list, cash flow, reports, and budget calculations." Crucially, "Hiding a transaction removes it from your transaction list, reports, and budget, but it does not impact your account balances or net worth calculations." Hide UI: transaction detail "eye" icon (web) / Hide toggle (mobile); bulk via Edit Multiple; or via Rules (Hide transaction toggle). UNDO/unhide: filter Transactions by Other > "Hidden Only", then untoggle the eye/Hide (individually or via Edit Multiple). Caveats: account-level hidden transactions can only be unhidden at the account level; hiding does NOT clear "Needs Review" status, and review filters deliberately include hidden transactions; hidden pending transactions may reappear once posted. Splits: rules and manual edits support splitting a transaction (by % or $), useful for partial reimbursements.
- **Takeaways:**
  - Prefer category-based exclusion as the core mechanism. Monarch prevents double-counting by putting transfers/CC-payments in an excluded 'Transfers' category group rather than by detecting and linking two-sided pairs. This is simpler and robust, and it is what a market leader actually ships.
  - Treat credit card payments as transfers, never as expenses, and keep the original purchases as the single source of spend. The CC bill payment (and its mirror leg) is excluded; spending is counted once at purchase time. This cleanly avoids the classic '$50 spent looks like $100' bug.
  - Expect TWO legs per transfer and exclude BOTH by category. Monarch explicitly tells users both the bank-side debit and the card-side credit should be the 'Credit Card Payment' category. If you exclude only one leg you reintroduce double counting, so dedup/exclusion must be per-leg, not per-pair.
  - Separate 'is a transfer' (category) from 'hide from reports' (a boolean). Monarch models these as two orthogonal controls. Hiding removes a txn from list/reports/budget/cash flow but NOT from balances/net worth. We should mirror that split so balances stay accurate even when something is excluded from spend.
  - Net worth must be computed from balances, not from the budget/spend ledger. Monarch's own worked example shows the expense (not the transfer legs) is what moves net worth; paying the card settles a liability and nets to zero on balances. Keep expense-tracking and balance/net-worth tracking as distinct calculations.
  - There is NO publicly documented amount+date matching window, no fuzzy transfer-pair matcher, and no auto-vs-suggest confidence threshold. Do not assume an industry-standard window exists; Monarch ships without one. If we build true pair-matching it is a differentiator, but we should design it ourselves (e.g., opposite-sign equal amounts within N days) rather than copy a Monarch spec that does not exist publicly.
  - Auto-categorization plus user rules carry most of the load. Monarch auto-assigns categories on sync, then lets users codify corrections as rules (match on raw original statement/merchant/amount/account, AND-combined, retroactively applicable, reorderable, with a 'quick rule' prompt on every manual edit). A rule engine that can set category=transfer and/or hide is high-value and reusable.
  - Match on the raw bank 'original statement', not the cleaned merchant name, for stable rules. Monarch explicitly recommends this because the original statement rarely changes while merchant display names get re-cleaned. Good guidance for our dedup keys and rule matching too.
  - Person-to-person payments are the main false-positive for transfer detection. Zelle/Venmo/checks often auto-classify as transfers but are real outflows; build an easy review/recategorize path and consider not auto-excluding P2P by default.
  - Duplicate-transaction handling is mostly upstream/account hygiene, not in-app fuzzy merge. Monarch's documented fixes are: check the bank site, watch pending-vs-posted churn, and de-duplicate ACCOUNTS (a duplicated connection is the top cause). Our dedup should strongly guard against duplicate account connections and pending->posted re-entry, and offer bulk manual delete as the safety valve.

