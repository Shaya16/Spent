import "server-only";

import { getDb } from "../index";
import { computeDedupHash } from "../../lib/dedup";
import { detectKind } from "../../lib/transfers";
import type {
  TransactionWithCategory,
  MonthlySummary,
  MerchantSummary,
  CategoryBreakdown,
} from "@/lib/types";
export type TransactionKindFilter = "expense" | "income" | "all";

interface RawTransaction {
  accountNumber: string;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency?: string;
  description: string;
  memo?: string;
  type: "normal" | "installments";
  status: "completed" | "pending";
  identifier?: string | number;
  installmentNumber?: number;
  installmentTotal?: number;
}

interface InsertResult {
  added: number;
  updated: number;
}

export function insertTransactions(
  transactions: RawTransaction[],
  provider: string,
  syncRunId: number
): InsertResult {
  const db = getDb();
  let added = 0;
  let updated = 0;

  const hashCounts = new Map<string, number>();

  const existingCountStmt = db.prepare(
    "SELECT COUNT(*) as count FROM transactions WHERE dedup_hash = ?"
  );

  const insertStmt = db.prepare(`
    INSERT INTO transactions (
      account_number, date, processed_date, original_amount, original_currency,
      charged_amount, charged_currency, description, memo, type, status,
      identifier, installment_number, installment_total, provider,
      sync_run_id, dedup_hash, dedup_sequence, kind
    ) VALUES (
      @accountNumber, @date, @processedDate, @originalAmount, @originalCurrency,
      @chargedAmount, @chargedCurrency, @description, @memo, @type, @status,
      @identifier, @installmentNumber, @installmentTotal, @provider,
      @syncRunId, @dedupHash, @dedupSequence, @kind
    )
    ON CONFLICT(dedup_hash, dedup_sequence) DO UPDATE SET
      status = CASE WHEN transactions.status = 'pending' THEN excluded.status ELSE transactions.status END,
      charged_amount = CASE WHEN transactions.status = 'pending' THEN excluded.charged_amount ELSE transactions.charged_amount END,
      processed_date = CASE WHEN transactions.status = 'pending' THEN excluded.processed_date ELSE transactions.processed_date END,
      kind = transactions.kind,
      updated_at = CASE WHEN transactions.status = 'pending' THEN datetime('now') ELSE transactions.updated_at END
  `);

  const batchInsert = db.transaction(() => {
    for (const txn of transactions) {
      const hash = computeDedupHash({
        accountNumber: txn.accountNumber,
        date: txn.date,
        originalAmount: txn.originalAmount,
        originalCurrency: txn.originalCurrency,
        description: txn.description,
        identifier: txn.identifier,
        installmentNumber: txn.installmentNumber,
        installmentTotal: txn.installmentTotal,
      });

      const batchCount = (hashCounts.get(hash) ?? 0) + 1;
      hashCounts.set(hash, batchCount);

      const { count: existingCount } = existingCountStmt.get(hash) as {
        count: number;
      };

      const sequence = batchCount - 1;
      const kind = detectKind(txn.description, provider, txn.chargedAmount);

      const params = {
        accountNumber: txn.accountNumber,
        date: txn.date,
        processedDate: txn.processedDate,
        originalAmount: txn.originalAmount,
        originalCurrency: txn.originalCurrency,
        chargedAmount: txn.chargedAmount,
        chargedCurrency: txn.chargedCurrency ?? null,
        description: txn.description,
        memo: txn.memo ?? null,
        type: txn.type,
        status: txn.status,
        identifier: txn.identifier != null ? String(txn.identifier) : null,
        installmentNumber: txn.installmentNumber ?? null,
        installmentTotal: txn.installmentTotal ?? null,
        provider,
        syncRunId: syncRunId,
        dedupHash: hash,
        dedupSequence: sequence,
        kind,
      };

      if (batchCount > existingCount) {
        insertStmt.run(params);
        added++;
      } else {
        const result = insertStmt.run(params);
        if (result.changes > 0) {
          updated++;
        }
      }
    }
  });

  batchInsert();
  return { added, updated };
}

interface QueryParams {
  from?: string;
  to?: string;
  search?: string;
  category?: number;
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  kind?: TransactionKindFilter;
  provider?: string;
}

const ALLOWED_SORT_COLUMNS = new Set([
  "date",
  "charged_amount",
  "description",
  "processed_date",
]);

export function queryTransactions(
  params: QueryParams
): { transactions: TransactionWithCategory[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (params.from) {
    conditions.push("t.date >= ?");
    values.push(params.from);
  }
  if (params.to) {
    conditions.push("t.date <= ?");
    values.push(params.to);
  }
  if (params.search) {
    conditions.push("(t.description LIKE ? OR t.memo LIKE ?)");
    const term = `%${params.search}%`;
    values.push(term, term);
  }
  if (params.category !== undefined) {
    conditions.push("t.category_id = ?");
    values.push(params.category);
  }
  const kind: TransactionKindFilter = params.kind ?? "all";
  if (kind === "income") {
    conditions.push("t.charged_amount > 0");
  } else if (kind === "expense") {
    conditions.push("t.charged_amount < 0");
  }
  if (params.provider) {
    conditions.push("t.provider = ?");
    values.push(params.provider);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sortCol = ALLOWED_SORT_COLUMNS.has(params.sort ?? "")
    ? params.sort!
    : "date";
  const sortOrder = params.order === "asc" ? "ASC" : "DESC";
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM transactions t ${where}`)
    .get(...values) as { total: number };

  const rows = db
    .prepare(
      `SELECT t.*, c.name as category_name, c.color as category_color
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       ${where}
       ORDER BY t.${sortCol} ${sortOrder}, t.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset);

  return {
    transactions: rows.map(mapTransactionRow),
    total: countRow.total,
  };
}

export function getUncategorizedTransactionIds(): number[] {
  const rows = getDb()
    .prepare(
      "SELECT id FROM transactions WHERE category_id IS NULL AND kind != 'transfer' ORDER BY date DESC"
    )
    .all() as { id: number }[];
  return rows.map((r) => r.id);
}

export function getUncategorizedIdsByKind(
  kind: "expense" | "income"
): number[] {
  const rows = getDb()
    .prepare(
      "SELECT id FROM transactions WHERE category_id IS NULL AND kind = ? ORDER BY date DESC"
    )
    .all(kind) as { id: number }[];
  return rows.map((r) => r.id);
}

export function getTransactionsForCategorization(
  ids: number[]
): { id: number; description: string; chargedAmount: number; originalCurrency: string; memo: string | null }[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT id, description, charged_amount as chargedAmount,
              original_currency as originalCurrency, memo
       FROM transactions WHERE id IN (${placeholders})`
    )
    .all(...ids) as { id: number; description: string; chargedAmount: number; originalCurrency: string; memo: string | null }[];
}

export function updateTransactionCategory(
  id: number,
  categoryId: number,
  source: "ai" | "user"
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET category_id = ?, category_source = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(categoryId, source, id);
}

export function batchUpdateCategories(
  updates: { id: number; categoryId: number }[]
): void {
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE transactions
     SET category_id = ?, category_source = 'ai', updated_at = datetime('now')
     WHERE id = ? AND category_source IS NOT 'user'`
  );

  db.transaction(() => {
    for (const { id, categoryId } of updates) {
      stmt.run(categoryId, id);
    }
  })();
}


export function getMonthlySummary(months: number): MonthlySummary[] {
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m', date) as month,
              SUM(ABS(charged_amount)) as amount
       FROM transactions
       WHERE date >= date('now', '-' || ? || ' months')
         AND status = 'completed'
         AND kind = 'expense'
       GROUP BY month
       ORDER BY month ASC`
    )
    .all(months) as MonthlySummary[];
}

export function getTopMerchants(
  from: string,
  to: string,
  limit = 10
): MerchantSummary[] {
  return getDb()
    .prepare(
      `SELECT description as name,
              SUM(ABS(charged_amount)) as amount,
              COUNT(*) as count
       FROM transactions
       WHERE date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense'
       GROUP BY description
       ORDER BY amount DESC
       LIMIT ?`
    )
    .all(from, to, limit) as MerchantSummary[];
}

export function getCategoryBreakdown(
  from: string,
  to: string
): CategoryBreakdown[] {
  return getDb()
    .prepare(
      `SELECT
         COALESCE(t.category_id, 0) as categoryId,
         COALESCE(c.name, 'Uncategorized') as name,
         COALESCE(c.color, '#B5B3AC') as color,
         SUM(ABS(t.charged_amount)) as amount,
         COUNT(*) as count
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ? AND t.date <= ? AND t.status = 'completed' AND t.kind = 'expense'
       GROUP BY t.category_id
       ORDER BY amount DESC`
    )
    .all(from, to) as CategoryBreakdown[];
}

export interface CategorySpend {
  categoryId: number;
  amount: number;
  count: number;
}

export function getCategorySpendInRange(
  from: string,
  to: string
): CategorySpend[] {
  return getDb()
    .prepare(
      `SELECT category_id as categoryId,
              SUM(ABS(charged_amount)) as amount,
              COUNT(*) as count
       FROM transactions
       WHERE date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense' AND category_id IS NOT NULL
       GROUP BY category_id`
    )
    .all(from, to) as CategorySpend[];
}

export interface CategoryTopMerchant {
  categoryId: number;
  merchant: string;
  amount: number;
}

export function getTopMerchantPerCategory(
  from: string,
  to: string
): CategoryTopMerchant[] {
  return getDb()
    .prepare(
      `SELECT category_id as categoryId, description as merchant, amount
       FROM (
         SELECT category_id, description, SUM(ABS(charged_amount)) as amount,
                ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY SUM(ABS(charged_amount)) DESC) as rn
         FROM transactions
         WHERE date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense' AND category_id IS NOT NULL
         GROUP BY category_id, description
       )
       WHERE rn = 1`
    )
    .all(from, to) as CategoryTopMerchant[];
}

export interface DailySpendPoint {
  date: string;
  amount: number;
}

export function getCategorySpendByDay(
  categoryId: number,
  from: string,
  to: string
): DailySpendPoint[] {
  return getDb()
    .prepare(
      `WITH RECURSIVE days(d) AS (
         SELECT date(?)
         UNION ALL
         SELECT date(d, '+1 day') FROM days WHERE d < date(?)
       )
       SELECT days.d as date,
              COALESCE(SUM(ABS(t.charged_amount)), 0) as amount
       FROM days
       LEFT JOIN transactions t
         ON substr(t.date, 1, 10) = days.d
         AND t.category_id = ?
         AND t.kind = 'expense'
         AND t.status = 'completed'
       GROUP BY days.d
       ORDER BY days.d ASC`
    )
    .all(from, to, categoryId) as DailySpendPoint[];
}

export interface TopMerchantForCategory {
  merchant: string;
  amount: number;
  count: number;
}

export function getTopMerchantsForCategory(
  categoryId: number,
  from: string,
  to: string,
  limit = 8
): TopMerchantForCategory[] {
  return getDb()
    .prepare(
      `SELECT description as merchant,
              SUM(ABS(charged_amount)) as amount,
              COUNT(*) as count
       FROM transactions
       WHERE category_id = ?
         AND date >= ? AND date <= ?
         AND status = 'completed'
         AND kind = 'expense'
       GROUP BY description
       ORDER BY amount DESC
       LIMIT ?`
    )
    .all(categoryId, from, to, limit) as TopMerchantForCategory[];
}

export function getPeriodTotal(from: string, to: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(ABS(charged_amount)), 0) as total
       FROM transactions
       WHERE date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense'`
    )
    .get(from, to) as { total: number };
  return row.total;
}

export function getPeriodCount(from: string, to: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as count
       FROM transactions
       WHERE date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense'`
    )
    .get(from, to) as { count: number };
  return row.count;
}

interface TransactionRow {
  id: number;
  account_number: string;
  date: string;
  processed_date: string;
  original_amount: number;
  original_currency: string;
  charged_amount: number;
  charged_currency: string | null;
  description: string;
  memo: string | null;
  type: string;
  status: string;
  identifier: string | null;
  installment_number: number | null;
  installment_total: number | null;
  category_id: number | null;
  category_source: string | null;
  provider: string;
  sync_run_id: number;
  kind: string;
  needs_review: number;
  created_at: string;
  updated_at: string;
  category_name?: string | null;
  category_color?: string | null;
}

function mapTransactionRow(row: unknown): TransactionWithCategory {
  const r = row as TransactionRow;
  return {
    id: r.id,
    accountNumber: r.account_number,
    date: r.date,
    processedDate: r.processed_date,
    originalAmount: r.original_amount,
    originalCurrency: r.original_currency,
    chargedAmount: r.charged_amount,
    chargedCurrency: r.charged_currency,
    description: r.description,
    memo: r.memo,
    type: r.type as "normal" | "installments",
    status: r.status as "completed" | "pending",
    identifier: r.identifier,
    installmentNumber: r.installment_number,
    installmentTotal: r.installment_total,
    categoryId: r.category_id,
    categorySource: r.category_source as "ai" | "user" | null,
    provider: r.provider,
    syncRunId: r.sync_run_id,
    kind: r.kind as "expense" | "income" | "transfer",
    needsReview: r.needs_review === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    categoryName: r.category_name ?? null,
    categoryColor: r.category_color ?? null,
  };
}

export function setTransactionKind(
  id: number,
  kind: "expense" | "income" | "transfer"
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET kind = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(kind, id);
}

export function setTransactionNeedsReview(id: number, value: boolean): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET needs_review = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(value ? 1 : 0, id);
}

interface TransactionContext {
  id: number;
  description: string;
  categoryId: number | null;
  kind: "expense" | "income" | "transfer";
}

export function getTransactionContext(id: number): TransactionContext | null {
  const row = getDb()
    .prepare(
      `SELECT id, description, category_id as categoryId, kind
       FROM transactions WHERE id = ?`
    )
    .get(id) as TransactionContext | undefined;
  return row ?? null;
}

export function batchSetNeedsReview(
  updates: { id: number; needsReview: boolean }[]
): void {
  if (updates.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE transactions
     SET needs_review = ?, updated_at = datetime('now')
     WHERE id = ?`
  );
  db.transaction(() => {
    for (const { id, needsReview } of updates) {
      stmt.run(needsReview ? 1 : 0, id);
    }
  })();
}

export interface NeedsReviewCount {
  categoryId: number;
  count: number;
}

export interface TransactionsSummary {
  income: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  expense: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  net: number;
  topMerchants: { description: string; total: number; count: number }[];
  pendingReviewCount: number;
}

export function getTransactionsSummary(
  from: string,
  to: string
): TransactionsSummary {
  const db = getDb();

  const incomeAgg = db
    .prepare(
      `SELECT COALESCE(SUM(charged_amount), 0) as total, COUNT(*) as count
       FROM transactions
       WHERE date >= ? AND date <= ? AND status = 'completed' AND charged_amount > 0`
    )
    .get(from, to) as { total: number; count: number };

  const expenseAgg = db
    .prepare(
      `SELECT COALESCE(SUM(ABS(charged_amount)), 0) as total, COUNT(*) as count
       FROM transactions
       WHERE date >= ? AND date <= ? AND status = 'completed' AND charged_amount < 0`
    )
    .get(from, to) as { total: number; count: number };

  const pickLargest = (sign: "income" | "expense"): TransactionWithCategory | null => {
    const cmp = sign === "income" ? "> 0" : "< 0";
    const row = db
      .prepare(
        `SELECT t.*, c.name as category_name, c.color as category_color
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.date >= ? AND t.date <= ? AND t.status = 'completed' AND t.charged_amount ${cmp}
         ORDER BY ABS(t.charged_amount) DESC, t.id DESC
         LIMIT 1`
      )
      .get(from, to);
    return row ? mapTransactionRow(row) : null;
  };

  const topMerchantsRows = db
    .prepare(
      `SELECT description,
              SUM(ABS(charged_amount)) as total,
              COUNT(*) as count
       FROM transactions
       WHERE date >= ? AND date <= ? AND status = 'completed' AND charged_amount < 0
       GROUP BY description
       ORDER BY total DESC
       LIMIT 5`
    )
    .all(from, to) as { description: string; total: number; count: number }[];

  const pendingReview = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM transactions
       WHERE date >= ? AND date <= ? AND status = 'completed' AND needs_review = 1`
    )
    .get(from, to) as { count: number };

  return {
    income: {
      total: incomeAgg.total,
      count: incomeAgg.count,
      largest: pickLargest("income"),
    },
    expense: {
      total: expenseAgg.total,
      count: expenseAgg.count,
      largest: pickLargest("expense"),
    },
    net: incomeAgg.total - expenseAgg.total,
    topMerchants: topMerchantsRows,
    pendingReviewCount: pendingReview.count,
  };
}

export function getNeedsReviewCountByCategory(
  from: string,
  to: string
): NeedsReviewCount[] {
  return getDb()
    .prepare(
      `SELECT category_id as categoryId, COUNT(*) as count
       FROM transactions
       WHERE date >= ? AND date <= ?
         AND status = 'completed'
         AND kind = 'expense'
         AND needs_review = 1
         AND category_id IS NOT NULL
       GROUP BY category_id`
    )
    .all(from, to) as NeedsReviewCount[];
}
