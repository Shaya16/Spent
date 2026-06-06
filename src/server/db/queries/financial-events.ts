import "server-only";

import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { EventType, FinancialEventWithMembers, MatchSettings } from "@/lib/types";
import type { MatchSettingsMap, ProposedEvent } from "@/server/lib/matching";
import { getOrm } from "../orm";
import {
  bankCredentials,
  eventMembers,
  financialEvents,
  matchSettings,
  transactions,
} from "../schema";

// DB-applying half of the deduplication engine. The pure proposal logic lives in
// src/server/lib/matching.ts; this module persists events, lists them for review,
// and reverses them losslessly. See docs/transaction-deduplication-design.md.

const EVENT_TYPES: EventType[] = [
  "internal_transfer",
  "credit_card_payment",
  "credit_card_statement",
  "atm_withdrawal",
  "loan_repayment",
  "investment_transfer",
  "refund_reversal",
  "fee",
  "duplicate",
];

// Fallback thresholds for workspaces created before a per-type row exists. Mirror
// the seed in migration 022_financial_events.sql.
const DEFAULT_SETTINGS: Record<EventType, MatchSettings> = {
  internal_transfer: mk("internal_transfer", 0.01, 2, 0.8, 0.97, true),
  credit_card_payment: mk("credit_card_payment", 0.01, 5, 0.8, 0.97, true),
  credit_card_statement: mk("credit_card_statement", 1.0, 38, 0.8, 0.97, false),
  atm_withdrawal: mk("atm_withdrawal", 0.01, 2, 0.8, 0.97, true),
  loan_repayment: mk("loan_repayment", 0.01, 5, 0.8, 0.97, true),
  investment_transfer: mk("investment_transfer", 0.01, 5, 0.8, 0.97, true),
  refund_reversal: mk("refund_reversal", 0.01, 90, 0.8, 0.97, false),
  fee: mk("fee", 0.01, 2, 0.8, 0.97, false),
  duplicate: mk("duplicate", 0.0, 10, 0.8, 0.97, false),
};

function mk(
  eventType: EventType,
  epsilon: number,
  dayWindow: number,
  minScore: number,
  autoScore: number,
  requireKeyword: boolean,
): MatchSettings {
  return { eventType, epsilon, dayWindow, minScore, autoScore, requireKeyword, enabled: true };
}

export function getMatchSettingsMap(workspaceId: number): MatchSettingsMap {
  const rows = getOrm()
    .select()
    .from(matchSettings)
    .where(eq(matchSettings.workspaceId, workspaceId))
    .all();

  const map: MatchSettingsMap = {};
  for (const type of EVENT_TYPES) map[type] = DEFAULT_SETTINGS[type];
  for (const r of rows) {
    map[r.eventType] = {
      eventType: r.eventType,
      epsilon: r.epsilon,
      dayWindow: r.dayWindow,
      minScore: r.minScore,
      autoScore: r.autoScore,
      requireKeyword: r.requireKeyword === 1,
      enabled: r.enabled === 1,
    };
  }
  return map;
}

export interface ApplyResult {
  eventsCreated: number;
  transactionsGrouped: number;
}

/**
 * Persist proposed events. Idempotent: a proposal whose event_key already exists
 * (including a rejected tombstone) is skipped, so a re-sync never duplicates an
 * event or re-suggests a dismissed one. Grouping legs get their kind flipped and
 * transactions.event_id set; 'purchase' legs are linked but stay spendable.
 */
export function applyProposedEvents(
  workspaceId: number,
  proposals: readonly ProposedEvent[],
): ApplyResult {
  if (proposals.length === 0) return { eventsCreated: 0, transactionsGrouped: 0 };

  let eventsCreated = 0;
  let transactionsGrouped = 0;

  getOrm().transaction((tx) => {
    for (const p of proposals) {
      const inserted = tx
        .insert(financialEvents)
        .values({
          workspaceId,
          eventType: p.eventType,
          canonicalTransactionId: p.canonicalTransactionId,
          status: p.needsReview ? "suggested" : "confirmed",
          source: "heuristic",
          confidence: p.confidence,
          reasons: JSON.stringify(p.reasons),
          eventKey: p.eventKey,
        })
        .onConflictDoNothing({
          target: [financialEvents.workspaceId, financialEvents.eventKey],
        })
        .returning({ id: financialEvents.id })
        .all();

      if (inserted.length === 0) continue; // existing event or rejected tombstone
      const eventId = inserted[0].id;
      eventsCreated++;

      for (const m of p.members) {
        tx.insert(eventMembers)
          .values({
            workspaceId,
            eventId,
            transactionId: m.transactionId,
            role: m.role,
            priorKind: m.priorKind,
            matchConfidence: p.confidence,
          })
          .run();

        if (m.grouping) {
          tx.update(transactions)
            .set({
              eventId,
              eventRole: m.role,
              matchConfidence: p.confidence,
              updatedAt: sql`datetime('now')`,
              ...(m.flipKindTo ? { kind: m.flipKindTo } : {}),
              ...(p.needsReview ? { needsReview: 1 } : {}),
            })
            .where(
              and(eq(transactions.workspaceId, workspaceId), eq(transactions.id, m.transactionId)),
            )
            .run();
          transactionsGrouped++;
        }
      }
    }
  });

  return { eventsCreated, transactionsGrouped };
}

export interface ListEventsParams {
  statuses?: ("suggested" | "confirmed" | "rejected")[];
  limit?: number;
  offset?: number;
}

export function listEvents(
  workspaceId: number,
  params: ListEventsParams = {},
): FinancialEventWithMembers[] {
  const orm = getOrm();
  const statuses: ("suggested" | "confirmed" | "rejected")[] =
    params.statuses && params.statuses.length > 0 ? params.statuses : ["suggested", "confirmed"];
  const limit = Math.min(params.limit ?? 100, 500);
  const offset = params.offset ?? 0;

  const events = orm
    .select()
    .from(financialEvents)
    .where(
      and(eq(financialEvents.workspaceId, workspaceId), inArray(financialEvents.status, statuses)),
    )
    .orderBy(
      desc(sql`${financialEvents.status} = 'suggested'`),
      asc(financialEvents.confidence),
      desc(financialEvents.id),
    )
    .limit(limit)
    .offset(offset)
    .all();

  if (events.length === 0) return [];

  const ids = events.map((e) => e.id);
  const members = orm
    .select({
      eventId: eventMembers.eventId,
      id: eventMembers.id,
      workspaceId: eventMembers.workspaceId,
      transactionId: eventMembers.transactionId,
      role: eventMembers.role,
      priorKind: eventMembers.priorKind,
      matchConfidence: eventMembers.matchConfidence,
      createdAt: eventMembers.createdAt,
      description: transactions.description,
      date: transactions.date,
      chargedAmount: transactions.chargedAmount,
      chargedCurrency: transactions.chargedCurrency,
      provider: transactions.provider,
      accountLabel: bankCredentials.label,
    })
    .from(eventMembers)
    .innerJoin(transactions, eq(transactions.id, eventMembers.transactionId))
    .leftJoin(bankCredentials, eq(bankCredentials.id, transactions.credentialId))
    .where(and(eq(eventMembers.workspaceId, workspaceId), inArray(eventMembers.eventId, ids)))
    .orderBy(asc(eventMembers.id))
    .all();

  const membersByEvent = new Map<number, typeof members>();
  for (const m of members) {
    const list = membersByEvent.get(m.eventId) ?? [];
    list.push(m);
    membersByEvent.set(m.eventId, list);
  }

  return events.map((e) => ({
    id: e.id,
    workspaceId: e.workspaceId,
    eventType: e.eventType,
    canonicalTransactionId: e.canonicalTransactionId,
    status: e.status,
    source: e.source,
    confidence: e.confidence,
    reasons: e.reasons ? (JSON.parse(e.reasons) as string[]) : [],
    eventKey: e.eventKey,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    members: (membersByEvent.get(e.id) ?? []).map((m) => ({
      id: m.id,
      workspaceId: m.workspaceId,
      eventId: m.eventId,
      transactionId: m.transactionId,
      role: m.role,
      priorKind: m.priorKind,
      matchConfidence: m.matchConfidence,
      createdAt: m.createdAt,
      description: m.description,
      date: m.date,
      chargedAmount: m.chargedAmount,
      chargedCurrency: m.chargedCurrency,
      provider: m.provider,
      accountLabel: m.accountLabel,
    })),
  }));
}

/** Accept a suggested event. Clears the review flag on its grouping legs. */
export function confirmEvent(workspaceId: number, eventId: number): boolean {
  return getOrm().transaction((tx) => {
    const res = tx
      .update(financialEvents)
      .set({ status: "confirmed", updatedAt: sql`datetime('now')` })
      .where(
        and(
          eq(financialEvents.workspaceId, workspaceId),
          eq(financialEvents.id, eventId),
          ne(financialEvents.status, "rejected"),
        ),
      )
      .run();
    if (res.changes === 0) return false;

    const memberIds = tx
      .select({ id: eventMembers.transactionId })
      .from(eventMembers)
      .where(and(eq(eventMembers.workspaceId, workspaceId), eq(eventMembers.eventId, eventId)))
      .all()
      .map((r) => r.id);

    if (memberIds.length > 0) {
      tx.update(transactions)
        .set({ needsReview: 0, updatedAt: sql`datetime('now')` })
        .where(and(eq(transactions.workspaceId, workspaceId), inArray(transactions.id, memberIds)))
        .run();
    }
    return true;
  });
}

/**
 * Reverse an event losslessly: restore each grouping leg's prior kind, detach it,
 * drop the membership rows, and keep the event row as a rejected tombstone so the
 * same match is never re-suggested on the next sync.
 */
export function rejectEvent(workspaceId: number, eventId: number): boolean {
  return getOrm().transaction((tx) => {
    const exists = tx
      .select({ id: financialEvents.id })
      .from(financialEvents)
      .where(and(eq(financialEvents.workspaceId, workspaceId), eq(financialEvents.id, eventId)))
      .get();
    if (!exists) return false;

    const members = tx
      .select({
        transactionId: eventMembers.transactionId,
        role: eventMembers.role,
        priorKind: eventMembers.priorKind,
      })
      .from(eventMembers)
      .where(and(eq(eventMembers.workspaceId, workspaceId), eq(eventMembers.eventId, eventId)))
      .all();

    for (const m of members) {
      if (m.role === "purchase") continue; // never set event_id; nothing to restore
      tx.update(transactions)
        .set({
          eventId: null,
          eventRole: null,
          matchConfidence: null,
          needsReview: 0,
          updatedAt: sql`datetime('now')`,
          ...(m.priorKind ? { kind: m.priorKind } : {}),
        })
        .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.id, m.transactionId)))
        .run();
    }

    tx.delete(eventMembers)
      .where(and(eq(eventMembers.workspaceId, workspaceId), eq(eventMembers.eventId, eventId)))
      .run();
    tx.update(financialEvents)
      .set({ status: "rejected", canonicalTransactionId: null, updatedAt: sql`datetime('now')` })
      .where(and(eq(financialEvents.workspaceId, workspaceId), eq(financialEvents.id, eventId)))
      .run();
    return true;
  });
}
