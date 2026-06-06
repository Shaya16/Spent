import { sql } from "drizzle-orm";
import { blob, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { EventRole, EventSource, EventStatus, EventType } from "@/lib/types";

// Drizzle schema for the typed query layer. It mirrors the live database, whose
// DDL is owned by the .sql migration runner (src/server/db/migrate.ts), NOT by
// drizzle-kit. Regenerate a reference with `bun run db:pull` after adding a
// migration, then reconcile column changes here by hand. CHECK constraints and
// indexes are intentionally omitted: they are enforced by the migrations and do
// not affect query types. Integer 0/1 flags stay `integer` (number); the query
// layer maps them to booleans exactly as before.

const createdAt = () => text("created_at").notNull().default(sql`(datetime('now'))`);
const updatedAt = () => text("updated_at").notNull().default(sql`(datetime('now'))`);

export const workspaces = sqliteTable("workspaces", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  slug: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaceSettings = sqliteTable("workspace_settings", {
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  key: text().notNull(),
  value: text().notNull(),
  updatedAt: updatedAt(),
});

export const settings = sqliteTable("settings", {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: updatedAt(),
});

export const categories = sqliteTable("categories", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  parentId: integer("parent_id"),
  name: text().notNull(),
  color: text().notNull(),
  icon: text(),
  kind: text().$type<"expense" | "income">().notNull().default("expense"),
  budgetMode: text("budget_mode").$type<"budgeted" | "tracking">().notNull().default("budgeted"),
  description: text(),
});

export const bankCredentials = sqliteTable("bank_credentials", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text().notNull(),
  label: text().notNull().default(""),
  credentialsEncrypted: blob("credentials_encrypted").notNull(),
  iv: blob().notNull(),
  authTag: blob("auth_tag").notNull(),
  requiresManualTwoFactor: integer("requires_manual_two_factor").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const syncRuns = sqliteTable("sync_runs", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text().notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  status: text().$type<"running" | "completed" | "failed">().notNull(),
  errorMessage: text("error_message"),
  transactionsAdded: integer("transactions_added").default(0),
  transactionsUpdated: integer("transactions_updated").default(0),
  scrapeFromDate: text("scrape_from_date").notNull(),
  createdAt: createdAt(),
  credentialId: integer("credential_id").references(() => bankCredentials.id, {
    onDelete: "set null",
  }),
});

export const transactions = sqliteTable("transactions", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  accountNumber: text("account_number").notNull(),
  date: text().notNull(),
  processedDate: text("processed_date").notNull(),
  originalAmount: real("original_amount").notNull(),
  originalCurrency: text("original_currency").notNull(),
  chargedAmount: real("charged_amount").notNull(),
  chargedCurrency: text("charged_currency"),
  description: text().notNull(),
  memo: text(),
  type: text().$type<"normal" | "installments">().notNull(),
  status: text().$type<"completed" | "pending">().notNull(),
  identifier: text(),
  installmentNumber: integer("installment_number"),
  installmentTotal: integer("installment_total"),
  categoryId: integer("category_id").references(() => categories.id),
  categorySource: text("category_source").$type<"ai" | "user">(),
  aiConfidence: integer("ai_confidence"),
  provider: text().notNull(),
  credentialId: integer("credential_id").references(() => bankCredentials.id, {
    onDelete: "set null",
  }),
  syncRunId: integer("sync_run_id")
    .notNull()
    .references(() => syncRuns.id),
  dedupHash: text("dedup_hash").notNull(),
  dedupSequence: integer("dedup_sequence").notNull().default(0),
  kind: text().$type<"expense" | "income" | "transfer">().notNull().default("expense"),
  needsReview: integer("needs_review").notNull().default(0),
  isExcluded: integer("is_excluded").notNull().default(0),
  eventId: integer("event_id"),
  eventRole: text("event_role").$type<EventRole>(),
  matchConfidence: real("match_confidence"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const budgets = sqliteTable("budgets", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  monthlyAmount: real("monthly_amount").notNull(),
  isAuto: integer("is_auto").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const merchantCategories = sqliteTable("merchant_categories", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  merchantKey: text("merchant_key").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  kind: text().$type<"expense" | "income">().notNull(),
  source: text().$type<"user" | "approved-ai">().notNull(),
  hitCount: integer("hit_count").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const categoryCorrections = sqliteTable("category_corrections", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  merchantKey: text("merchant_key").notNull(),
  description: text().notNull(),
  aiCategoryId: integer("ai_category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  userCategoryId: integer("user_category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  kind: text().$type<"expense" | "income">().notNull(),
  createdAt: createdAt(),
});

export const excludedMerchants = sqliteTable("excluded_merchants", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text().notNull(),
  merchantKey: text("merchant_key").notNull(),
  createdAt: createdAt(),
});

export const chatSessions = sqliteTable("chat_sessions", {
  id: text().primaryKey(),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text().notNull(),
  titleSource: text("title_source").$type<"auto" | "manual">().notNull().default("auto"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer().primaryKey({ autoIncrement: true }),
  sessionId: text("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(),
  role: text().notNull(),
  partsJson: text("parts_json").notNull(),
  position: integer().notNull(),
  createdAt: createdAt(),
});

export const financialEvents = sqliteTable("financial_events", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  eventType: text("event_type").$type<EventType>().notNull(),
  canonicalTransactionId: integer("canonical_transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  status: text().$type<EventStatus>().notNull().default("suggested"),
  source: text().$type<EventSource>().notNull().default("heuristic"),
  confidence: real().notNull().default(1),
  reasons: text(),
  eventKey: text("event_key").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const eventMembers = sqliteTable("event_members", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  eventId: integer("event_id")
    .notNull()
    .references(() => financialEvents.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  role: text().$type<EventRole>().notNull(),
  priorKind: text("prior_kind").$type<"expense" | "income" | "transfer">(),
  matchConfidence: real("match_confidence"),
  createdAt: createdAt(),
});

export const matchSettings = sqliteTable("match_settings", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  eventType: text("event_type").$type<EventType>().notNull(),
  epsilon: real().notNull().default(0.01),
  dayWindow: integer("day_window").notNull().default(2),
  minScore: real("min_score").notNull().default(0.8),
  autoScore: real("auto_score").notNull().default(0.97),
  requireKeyword: integer("require_keyword").notNull().default(1),
  enabled: integer().notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const matchRules = sqliteTable("match_rules", {
  id: integer().primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  descriptionPattern: text("description_pattern"),
  provider: text(),
  amountMin: real("amount_min"),
  amountMax: real("amount_max"),
  setKind: text("set_kind").$type<"expense" | "income" | "transfer">(),
  setEventType: text("set_event_type").$type<EventType>(),
  setCategoryId: integer("set_category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  hide: integer().notNull().default(0),
  priority: integer().notNull().default(100),
  enabled: integer().notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
