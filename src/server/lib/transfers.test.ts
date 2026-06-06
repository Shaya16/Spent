import { describe, expect, test } from "bun:test";

import { detectKind, isAtmWithdrawal, matchesInternalTransfer } from "./transfers";

describe("detectKind — credit card settlements", () => {
  test("plural 'כרטיסי אשראי' on a bank account is a transfer", () => {
    expect(detectKind("כרטיסי אשראי ל", "hapoalim", -1000)).toBe("transfer");
  });

  test("'כאל' on a bank account is a transfer", () => {
    expect(detectKind("כאל", "leumi", -500)).toBe("transfer");
  });

  test("newly added keywords (אמקס, leumi card) on a bank account are transfers", () => {
    expect(detectKind("אמקס", "hapoalim", -800)).toBe("transfer");
    expect(detectKind("LEUMI CARD", "leumi", -800)).toBe("transfer");
  });

  test("a normal credit-card purchase is NOT a settlement (provider gate)", () => {
    // "Cal - Gett" arriving from a credit-card provider is a real purchase.
    expect(detectKind("Cal - Gett", "isracard", -30)).toBe("expense");
    // Even a settlement-looking word stays an expense when it is not a bank.
    expect(detectKind("כאל", "isracard", -30)).toBe("expense");
  });

  test("bank income without a settlement keyword is income", () => {
    expect(detectKind("משכורת", "hapoalim", 12000)).toBe("income");
  });
});

describe("isAtmWithdrawal", () => {
  test("matches ATM keywords", () => {
    expect(isAtmWithdrawal("משיכת מזומן")).toBe(true);
    expect(isAtmWithdrawal("כספומט בנק הפועלים")).toBe(true);
    expect(isAtmWithdrawal("ATM WITHDRAWAL")).toBe(true);
  });

  test("does not match a normal merchant", () => {
    expect(isAtmWithdrawal("שופרסל")).toBe(false);
  });
});

describe("matchesInternalTransfer", () => {
  test("matches transfer keywords", () => {
    expect(matchesInternalTransfer("העברה לחשבון")).toBe(true);
    expect(matchesInternalTransfer("BANK TRANSFER")).toBe(true);
    expect(matchesInternalTransfer("wire out")).toBe(true);
  });

  test("does not match a normal merchant", () => {
    expect(matchesInternalTransfer("שופרסל")).toBe(false);
  });
});
