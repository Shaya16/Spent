import { describe, expect, test } from "bun:test";

import { findInternalTransferPairs, type TransferCandidate } from "./internal-transfers";

function row(partial: Partial<TransferCandidate> & { id: number }): TransferCandidate {
  return {
    credentialId: 1,
    accountNumber: "A",
    date: "2026-05-01",
    chargedAmount: -100,
    chargedCurrency: "ILS",
    description: "העברה",
    kind: "expense",
    ...partial,
  };
}

describe("findInternalTransferPairs", () => {
  test("pairs opposite-sign equal-amount rows across accounts within the window", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -1500, description: "העברה לחשבון" }),
      row({ id: 2, credentialId: 2, chargedAmount: 1500, kind: "income", date: "2026-05-02" }),
    ]);
    expect(pairs).toEqual([{ debitId: 1, creditId: 2 }]);
  });

  test("does NOT pair when neither side has a transfer keyword", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -200, description: "שופרסל" }),
      row({ id: 2, credentialId: 2, chargedAmount: 200, kind: "income", description: "מכולת" }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("does not pair within the same account", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, accountNumber: "A", chargedAmount: -200 }),
      row({ id: 2, credentialId: 1, accountNumber: "A", chargedAmount: 200, kind: "income" }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("rejects amounts beyond epsilon", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -200 }),
      row({ id: 2, credentialId: 2, chargedAmount: 201, kind: "income" }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("rejects dates more than 2 days apart", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -200, date: "2026-05-01" }),
      row({ id: 2, credentialId: 2, chargedAmount: 200, kind: "income", date: "2026-05-05" }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("rejects currency mismatch", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -200, chargedCurrency: "ILS" }),
      row({ id: 2, credentialId: 2, chargedAmount: 200, kind: "income", chargedCurrency: "USD" }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("skips rows already marked as transfers", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -200, kind: "transfer" }),
      row({ id: 2, credentialId: 2, chargedAmount: 200, kind: "transfer" }),
    ]);
    expect(pairs).toEqual([]);
  });

  test("greedy 1:1 — two debits, one credit produce exactly one deterministic pair", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -300, date: "2026-05-03" }),
      row({ id: 2, credentialId: 1, chargedAmount: -300, date: "2026-05-01" }),
      row({ id: 3, credentialId: 2, chargedAmount: 300, kind: "income", date: "2026-05-01" }),
    ]);
    expect(pairs).toHaveLength(1);
    // The same-day debit (id 2) is closest to the credit and is matched.
    expect(pairs[0]).toEqual({ debitId: 2, creditId: 3 });
  });

  test("epsilon boundary: 200.00 vs 200.005 still pairs", () => {
    const pairs = findInternalTransferPairs([
      row({ id: 1, credentialId: 1, chargedAmount: -200 }),
      row({ id: 2, credentialId: 2, chargedAmount: 200.005, kind: "income" }),
    ]);
    expect(pairs).toEqual([{ debitId: 1, creditId: 2 }]);
  });
});
