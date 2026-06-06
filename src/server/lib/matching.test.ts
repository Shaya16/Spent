import { describe, expect, test } from "bun:test";

import type { MatchSettings } from "@/lib/types";
import { type MatchCandidate, type MatchSettingsMap, proposeEvents } from "./matching";

function cand(p: Partial<MatchCandidate> & { id: number }): MatchCandidate {
  return {
    credentialId: null,
    accountNumber: "A",
    provider: "leumi",
    date: "2026-05-01",
    chargedAmount: -100,
    chargedCurrency: "ILS",
    description: "העברה",
    kind: "expense",
    dedupHash: `h${p.id}`,
    dedupSequence: 0,
    ...p,
  };
}

function setting(eventType: MatchSettings["eventType"], enabled = true): MatchSettings {
  return {
    eventType,
    epsilon: 0.01,
    dayWindow: 2,
    minScore: 0.8,
    autoScore: 0.97,
    requireKeyword: true,
    enabled,
  };
}

const SETTINGS: MatchSettingsMap = {
  internal_transfer: setting("internal_transfer"),
  credit_card_payment: setting("credit_card_payment"),
  atm_withdrawal: setting("atm_withdrawal"),
};

const NO_ATM = { treatAtmAsTransfers: false };
const WITH_ATM = { treatAtmAsTransfers: true };

describe("proposeEvents", () => {
  test("groups an internal transfer into one event with two grouping legs", () => {
    const events = proposeEvents(
      [
        cand({ id: 1, accountNumber: "A", chargedAmount: -1500, description: "העברה לחשבון" }),
        cand({
          id: 2,
          accountNumber: "B",
          chargedAmount: 1500,
          kind: "income",
          date: "2026-05-02",
        }),
      ],
      SETTINGS,
      NO_ATM,
    );
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.eventType).toBe("internal_transfer");
    expect(e.needsReview).toBe(true);
    expect(e.canonicalTransactionId).toBeNull();
    expect(e.confidence).toBeGreaterThanOrEqual(0.8);
    expect(e.reasons.length).toBeGreaterThan(0);
    const roles = e.members.map((m) => m.role).sort();
    expect(roles).toEqual(["credit", "debit"]);
    expect(e.members.every((m) => m.flipKindTo === "transfer" && m.grouping)).toBe(true);
  });

  test("event_key is deterministic and independent of member ordering", () => {
    const a = cand({ id: 1, accountNumber: "A", chargedAmount: -1500, description: "העברה" });
    const b = cand({ id: 2, accountNumber: "B", chargedAmount: 1500, kind: "income" });
    const e1 = proposeEvents([a, b], SETTINGS, NO_ATM)[0];
    const e2 = proposeEvents([b, a], SETTINGS, NO_ATM)[0];
    expect(e1.eventKey).toBe(e2.eventKey);
    expect(e1.eventKey.startsWith("internal_transfer:")).toBe(true);
  });

  test("wraps a bank-side credit card bill payment as a single-leg event", () => {
    const events = proposeEvents(
      [cand({ id: 5, provider: "hapoalim", kind: "transfer", description: "חיוב ויזה" })],
      SETTINGS,
      NO_ATM,
    );
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("credit_card_payment");
    expect(events[0].needsReview).toBe(false);
    expect(events[0].members).toHaveLength(1);
    expect(events[0].members[0].role).toBe("bill_payment");
    // The bank leg is already kind='transfer'; the event does not change it.
    expect(events[0].members[0].flipKindTo).toBeNull();
  });

  test("does not wrap card payments from a non-bank provider", () => {
    const events = proposeEvents(
      [cand({ id: 5, provider: "isracard", kind: "transfer", description: "ויזה" })],
      SETTINGS,
      NO_ATM,
    );
    expect(events).toHaveLength(0);
  });

  test("ATM withdrawals only become events when cash is tracked manually", () => {
    const rows = [cand({ id: 9, chargedAmount: -400, description: "משיכת מזומן כספומט" })];
    expect(proposeEvents(rows, SETTINGS, NO_ATM)).toHaveLength(0);
    const withAtm = proposeEvents(rows, SETTINGS, WITH_ATM);
    expect(withAtm).toHaveLength(1);
    expect(withAtm[0].eventType).toBe("atm_withdrawal");
    expect(withAtm[0].members[0].flipKindTo).toBe("transfer");
  });

  test("a leg claimed by a transfer is not also claimed as a card payment", () => {
    // A transfer debit that also happens to mention a card keyword must not be
    // double-counted into two events.
    const events = proposeEvents(
      [
        cand({ id: 1, accountNumber: "A", chargedAmount: -1500, description: "העברה ויזה" }),
        cand({
          id: 2,
          accountNumber: "B",
          chargedAmount: 1500,
          kind: "income",
          description: "העברה",
        }),
      ],
      SETTINGS,
      NO_ATM,
    );
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("internal_transfer");
  });

  test("disabled settings suppress the matcher", () => {
    const events = proposeEvents(
      [
        cand({ id: 1, accountNumber: "A", chargedAmount: -1500, description: "העברה" }),
        cand({ id: 2, accountNumber: "B", chargedAmount: 1500, kind: "income" }),
      ],
      { internal_transfer: setting("internal_transfer", false) },
      NO_ATM,
    );
    expect(events).toHaveLength(0);
  });
});
