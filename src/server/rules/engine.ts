import "server-only";

import { normalizeMerchant } from "./normalize";

export type TxnKind = "expense" | "income" | "transfer";

export interface Rule {
  id: number;
  field: "merchant" | "amount" | "account";
  op: "contains" | "equals" | "regex" | "gt" | "lt";
  value: string;
  categoryId?: number;
  kind?: TxnKind;
}

export interface RuleTxn {
  description: string;
  chargedAmount: number;
  accountNumber: string;
}

export interface RuleResult {
  categoryId?: number;
  kind?: TxnKind;
}

// shortcut: conservative heuristic, rejects any quantified group that contains a quantifier or alternation (so also `(foo|bar)+`); upgrade to a linear-time regex engine (re2) if rules need more.
export function isSafeRegex(pattern: string): boolean {
  if (pattern.length > 100) return false;
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }
  const open: number[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      i++;
    } else if (inClass) {
      if (c === "]") inClass = false;
    } else if (c === "[") {
      inClass = true;
    } else if (c === "(") {
      open.push(i);
    } else if (c === ")") {
      const from = open.pop() ?? 0;
      if (/[+*{]/.test(pattern[i + 1] ?? "") && /[+*{|]/.test(pattern.slice(from + 1, i))) return false;
    }
  }
  return true;
}

function matches(rule: Rule, txn: RuleTxn): boolean {
  if (rule.field === "amount") {
    const amount = Math.abs(txn.chargedAmount);
    const limit = Number(rule.value);
    if (Number.isNaN(limit)) return false;
    return rule.op === "gt" ? amount > limit : rule.op === "lt" ? amount < limit : false;
  }

  const subject = rule.field === "merchant" ? normalizeMerchant(txn.description) : txn.accountNumber;
  switch (rule.op) {
    case "contains":
      return subject.includes(normalizeMerchant(rule.value));
    case "equals":
      return subject === normalizeMerchant(rule.value);
    case "regex":
      return isSafeRegex(rule.value) && new RegExp(rule.value, "i").test(subject);
    default:
      return false;
  }
}

/** First matching rule (lowest id) wins. */
export function applyRules(txn: RuleTxn, rules: Rule[]): RuleResult | null {
  for (const rule of [...rules].sort((a, b) => a.id - b.id)) {
    if (matches(rule, txn)) return { categoryId: rule.categoryId, kind: rule.kind };
  }
  return null;
}
