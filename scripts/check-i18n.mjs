#!/usr/bin/env bun
// Runs @lingual/i18n-check (recommended by next-intl docs) against
// src/i18n/messages. The --ignore list covers (a) namespaces that the static
// parser cannot trace because keys are accessed dynamically and (b) a baseline
// set of pre-existing orphan keys to lock current state without churning the
// CI-enable PR. Treat additions to baseline.* as tech debt — every key here
// is something to delete once setup wizard and settings get cleaner i18n.

import { spawn } from "node:child_process";

// Legitimate dynamic-access namespaces. These keys exist for a reason; the
// linter just can't see the access pattern.
const dynamicNamespaces = ["banks.*", "categoriesSeeded.*", "settings.sidebar.*", "nav.*"];

// Pre-existing orphan keys, grandfathered to land CI without a huge cleanup
// diff. New code MUST NOT add to this list — fix the orphan or use the key.
const baseline = [
  "setup.*",
  "common.*",
  "transactions.allCategories",
  "transactions.allAccounts",
  "settings.bank.transactionsCount",
  "settings.bank.justNow",
  "settings.bank.minutesAgo",
  "settings.bank.hoursAgo",
  "settings.bank.daysAgo",
  "settings.categories.title",
  "settings.categories.description",
  "settings.categories.tabExpense",
  "settings.categories.tabIncome",
  "settings.categories.searchPlaceholder",
  "settings.categories.newGroupButton",
  "settings.categories.newGroupDialogTitle",
  "settings.categories.newGroupName",
  "settings.categories.newGroupNamePlaceholder",
  "settings.categories.newGroupKind",
  "settings.categories.createButton",
  "settings.categories.createdToast",
  "settings.categories.createGroupFailed",
  "settings.categories.noMatching",
  "settings.categories.ungrouped",
  "settings.categories.editGroup",
  "settings.categories.spentLabel",
  "settings.categories.tracking",
  "settings.categories.noBudget",
];

const args = [
  "--bun",
  "@lingual/i18n-check@latest",
  "--format",
  "next-intl",
  "--source",
  "en",
  "--locales",
  "src/i18n/messages",
  "--unused",
  "src",
  "--ignore",
  ...dynamicNamespaces,
  ...baseline,
];

const child = spawn("bunx", args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
