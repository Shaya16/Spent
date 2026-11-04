import { describe, it, expect } from "vitest";
import { applyRules, isSafeRegex, type Rule } from "@/server/rules/engine";

const txn = { description: "שופרסל דיל תל אביב 12", chargedAmount: -250, accountNumber: "1234" };
const r = (o: Partial<Rule> & Pick<Rule, "field" | "op" | "value">): Rule => ({ id: 1, ...o });

describe("applyRules", () => {
  it("matches merchant contains on the normalized description", () => {
    expect(applyRules(txn, [r({ field: "merchant", op: "contains", value: "שופרסל", categoryId: 7 })])).toEqual({ categoryId: 7, kind: undefined });
  });
  it("matches merchant equals only on the full normalized name", () => {
    expect(applyRules(txn, [r({ field: "merchant", op: "equals", value: "שופרסל", categoryId: 7 })])).toBeNull();
    expect(applyRules(txn, [r({ field: "merchant", op: "equals", value: "שופרסל דיל תל אביב", categoryId: 7 })])).not.toBeNull();
  });
  it("matches merchant by regex", () => {
    expect(applyRules(txn, [r({ field: "merchant", op: "regex", value: "^שופרסל", categoryId: 3 })])?.categoryId).toBe(3);
  });
  it("compares amounts on absolute value", () => {
    expect(applyRules(txn, [r({ field: "amount", op: "gt", value: "200", categoryId: 4 })])?.categoryId).toBe(4);
    expect(applyRules(txn, [r({ field: "amount", op: "lt", value: "200", categoryId: 4 })])).toBeNull();
  });
  it("first matching rule by id wins", () => {
    const rules = [
      r({ id: 2, field: "merchant", op: "contains", value: "שופרסל", categoryId: 20 }),
      r({ id: 1, field: "merchant", op: "contains", value: "שופרסל", categoryId: 10 }),
    ];
    expect(applyRules(txn, rules)?.categoryId).toBe(10);
  });
  it("can set kind to transfer", () => {
    expect(applyRules(txn, [r({ field: "merchant", op: "contains", value: "שופרסל", kind: "transfer" })])?.kind).toBe("transfer");
  });
  it("skips an invalid regex instead of throwing", () => {
    expect(applyRules(txn, [r({ field: "merchant", op: "regex", value: "(", categoryId: 1 })])).toBeNull();
  });
  it("skips an unsafe regex without hanging", () => {
    const evil = { ...txn, description: "a".repeat(40) + "!" };
    const start = Date.now();
    expect(applyRules(evil, [r({ field: "merchant", op: "regex", value: "(a+)+$", categoryId: 1 })])).toBeNull();
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe("isSafeRegex", () => {
  it("rejects nested quantifiers and overlong patterns", () => {
    expect(isSafeRegex("(a+)+$")).toBe(false);
    expect(isSafeRegex("x".repeat(101))).toBe(false);
  });
  it("rejects nested groups and quantified alternation", () => {
    expect(isSafeRegex("((a+))+$")).toBe(false);
    expect(isSafeRegex("(a|a)*$")).toBe(false);
  });
  it("accepts ordinary patterns", () => {
    expect(isSafeRegex("^שופרסל|רמי לוי")).toBe(true);
  });
});
