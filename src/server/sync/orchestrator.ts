import "server-only";

import { BANK_PROVIDERS, type BankProvider, type SyncKind } from "@/lib/types";
import { createAIProvider } from "@/server/ai/factory";
import { ensureOllamaRunning } from "@/server/ai/ollama-manager";
import {
  type BankCredentialMeta,
  getBankCredentials,
  getRequiresManualTwoFactor,
  listBankCredentials,
  updateCredentialField,
} from "@/server/db/queries/bank-credentials";
import { getAllCategories, getCategoryByName } from "@/server/db/queries/categories";
import { getRecentCorrections } from "@/server/db/queries/category-corrections";
import { applyMerchantRulesToSyncRun } from "@/server/db/queries/excluded-merchants";
import { getAppSettings } from "@/server/db/queries/settings";
import { completeSyncRun, createSyncRun, failSyncRun } from "@/server/db/queries/sync-runs";
import {
  batchSetNeedsReview,
  batchUpdateCategories,
  getTransactionsForCategorization,
  getUncategorizedAtmExpenses,
  getUncategorizedIdsByKind,
  insertTransactions,
} from "@/server/db/queries/transactions";
import { getWorkspace } from "@/server/db/queries/workspaces";
import { toLocalISODate } from "@/server/lib/date-utils";
import {
  incrementMerchantHits,
  lookupMerchantCategoriesBulk,
  normalizeMerchant,
} from "@/server/lib/merchant-memory";
import { isAtmWithdrawal } from "@/server/lib/transfers";
import { listAllWorkspaceIds } from "@/server/lib/workspace-context";
import { scrapeBank } from "@/server/scrapers";
import { scrapeOneZeroFirstTime, scrapeOneZeroWithToken } from "@/server/scrapers/one-zero";
import type { ScrapeResult } from "@/server/scrapers/types";
import { markSyncEnd, markSyncHeartbeat, markSyncStart } from "@/server/sync/activity";
import { runMatchingStep } from "@/server/sync/matching-step";
import { cancelOtpRequest, registerOtpRequest } from "@/server/sync/otp-bridge";

export type SyncEventSender = (event: string, data: Record<string, unknown>) => void;

export interface ProviderResult {
  provider: BankProvider;
  credentialId: number;
  label: string;
  ok: boolean;
  added: number;
  updated: number;
  errorMessage?: string;
  syncRunId?: number;
}

export interface WorkspaceSummary {
  workspaceId: number;
  workspaceName: string;
  providers: ProviderResult[];
  added: number;
  updated: number;
  categorized: number;
  aiWarning: string | null;
}

export function friendlyAIError(err: unknown, modelName: string, provider?: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const isNetwork = /ECONNREFUSED|fetch failed|ENOTFOUND|ETIMEDOUT/i.test(msg);
  const isAuth = /api[_-]?key|401|403/i.test(msg);

  if (provider === "ollama") {
    if (/model.*not found|pull.*model|404/i.test(msg)) {
      return `Ollama model "${modelName}" is not installed. Run: ollama pull ${modelName}`;
    }
    if (isNetwork) {
      return "Ollama is not reachable. Make sure it's installed and that no firewall is blocking port 11434.";
    }
  }
  if (provider === "claude" && (isNetwork || isAuth)) {
    return "Claude API request failed. Check your API key and connection in settings.";
  }
  if (provider === "gemini" && (isNetwork || isAuth)) {
    return "Gemini API request failed. Check your API key and connection in settings.";
  }
  return `AI categorization failed: ${msg}`;
}

function supportsProgrammaticTwoFactor(provider: BankProvider): boolean {
  return Boolean(BANK_PROVIDERS.find((b) => b.id === provider)?.supportsProgrammaticTwoFactor);
}

interface RunScrapeArgs {
  workspaceId: number;
  workspaceName: string;
  credentialId: number;
  provider: BankProvider;
  credentials: Record<string, string>;
  startDate: Date;
  syncRunId: number;
  manualTwoFactor: boolean;
  send: SyncEventSender;
}

async function runScrapeForProvider(args: RunScrapeArgs): Promise<ScrapeResult> {
  const {
    workspaceId,
    workspaceName,
    credentialId,
    provider,
    credentials,
    startDate,
    syncRunId,
    manualTwoFactor,
    send,
  } = args;

  if (supportsProgrammaticTwoFactor(provider)) {
    const existingToken = credentials.otpLongTermToken;
    if (existingToken) {
      return scrapeOneZeroWithToken({
        email: credentials.email,
        password: credentials.password,
        otpLongTermToken: existingToken,
        startDate,
      });
    }

    if (!credentials.email || !credentials.password) {
      return {
        success: false,
        accounts: [],
        errorMessage: "Email and password are required for One Zero.",
      };
    }
    if (!credentials.phoneNumber) {
      return {
        success: false,
        accounts: [],
        errorMessage: "Phone number is required to receive the One Zero 2FA code.",
      };
    }

    const bridge = registerOtpRequest(syncRunId, workspaceId, provider);

    const result = await scrapeOneZeroFirstTime({
      email: credentials.email,
      password: credentials.password,
      phoneNumber: credentials.phoneNumber,
      startDate,
      awaitOtp: async () => {
        send("provider-2fa-needed", {
          workspaceId,
          workspaceName,
          provider,
          syncRunId,
        });
        return bridge.wait();
      },
      onOtpSubmitted: () => {
        send("provider-2fa-submitted", {
          workspaceId,
          workspaceName,
          provider,
          syncRunId,
        });
      },
    });

    if (result.otpLongTermToken) {
      updateCredentialField(workspaceId, credentialId, "otpLongTermToken", result.otpLongTermToken);
    }

    return result;
  }

  if (manualTwoFactor) {
    send("provider-2fa-manual", {
      workspaceId,
      workspaceName,
      provider,
    });
  }

  return scrapeBank(workspaceId, provider, credentials, startDate, {
    manualTwoFactor,
  });
}

async function syncOneCredential(
  workspaceId: number,
  workspaceName: string,
  meta: BankCredentialMeta,
  credentials: Record<string, string>,
  startDate: Date,
  send: SyncEventSender,
): Promise<ProviderResult> {
  const provider = meta.provider as BankProvider;
  const syncRunId = createSyncRun(workspaceId, provider, meta.id, toLocalISODate(startDate));
  const manualTwoFactor = getRequiresManualTwoFactor(workspaceId, meta.id);

  let result: ScrapeResult;
  try {
    result = await runScrapeForProvider({
      workspaceId,
      workspaceName,
      credentialId: meta.id,
      provider,
      credentials,
      startDate,
      syncRunId,
      manualTwoFactor,
      send,
    });
  } finally {
    cancelOtpRequest(syncRunId, "Scrape completed");
  }

  if (!result.success) {
    failSyncRun(syncRunId, result.errorMessage ?? "Scraping failed");
    return {
      provider,
      credentialId: meta.id,
      label: meta.label,
      ok: false,
      added: 0,
      updated: 0,
      errorMessage: result.errorMessage ?? "Scraping failed",
      syncRunId,
    };
  }

  const allTransactions = result.accounts.flatMap((account) =>
    account.transactions.map((txn) => ({
      accountNumber: account.accountNumber,
      ...txn,
      installmentNumber: txn.installments?.number,
      installmentTotal: txn.installments?.total,
    })),
  );

  const { added, updated } = insertTransactions(
    workspaceId,
    allTransactions,
    provider,
    meta.id,
    syncRunId,
  );
  applyMerchantRulesToSyncRun(workspaceId, syncRunId);
  completeSyncRun(syncRunId, added, updated);

  return {
    provider,
    credentialId: meta.id,
    label: meta.label,
    ok: true,
    added,
    updated,
    syncRunId,
  };
}

export async function syncWorkspace(
  workspaceId: number,
  filterCredentialId: number | undefined,
  send: SyncEventSender,
): Promise<WorkspaceSummary> {
  const workspace = getWorkspace(workspaceId);
  const workspaceName = workspace?.name ?? `Workspace ${workspaceId}`;

  const allCreds = listBankCredentials(workspaceId);
  const credsToSync: BankCredentialMeta[] = filterCredentialId
    ? allCreds.filter((c) => c.id === filterCredentialId)
    : allCreds;

  if (credsToSync.length === 0) {
    send("plan", {
      workspaceId,
      workspaceName,
      providers: [],
      total: 0,
    });
    return {
      workspaceId,
      workspaceName,
      providers: [],
      added: 0,
      updated: 0,
      categorized: 0,
      aiWarning: null,
    };
  }

  const settings = getAppSettings(workspaceId);
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - settings.monthsToSync);

  send("plan", {
    workspaceId,
    workspaceName,
    providers: credsToSync.map((c) => c.provider),
    total: credsToSync.length,
  });

  const results: ProviderResult[] = [];

  for (let i = 0; i < credsToSync.length; i++) {
    const meta = credsToSync[i];
    const provider = meta.provider as BankProvider;

    send("provider-start", {
      workspaceId,
      workspaceName,
      provider,
      credentialId: meta.id,
      label: meta.label,
      index: i,
      total: credsToSync.length,
    });
    markSyncHeartbeat();

    const credentials = getBankCredentials(workspaceId, meta.id);
    if (!credentials) {
      send("provider-done", {
        workspaceId,
        workspaceName,
        provider,
        credentialId: meta.id,
        label: meta.label,
        ok: false,
        added: 0,
        updated: 0,
        errorMessage: `No credentials configured for ${meta.label}`,
      });
      results.push({
        provider,
        credentialId: meta.id,
        label: meta.label,
        ok: false,
        added: 0,
        updated: 0,
        errorMessage: "No credentials",
      });
      continue;
    }

    try {
      const result = await syncOneCredential(
        workspaceId,
        workspaceName,
        meta,
        credentials,
        startDate,
        send,
      );
      results.push(result);
      send("provider-done", {
        workspaceId,
        workspaceName,
        provider,
        credentialId: meta.id,
        label: meta.label,
        ok: result.ok,
        added: result.added,
        updated: result.updated,
        errorMessage: result.errorMessage,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message.replace(/\b\d{5,}\b/g, "[REDACTED]")
          : "Unknown scrape error";
      results.push({
        provider,
        credentialId: meta.id,
        label: meta.label,
        ok: false,
        added: 0,
        updated: 0,
        errorMessage: message,
      });
      send("provider-done", {
        workspaceId,
        workspaceName,
        provider,
        credentialId: meta.id,
        label: meta.label,
        ok: false,
        added: 0,
        updated: 0,
        errorMessage: message,
      });
    }
  }

  const totalAdded = results.reduce((s, r) => s + r.added, 0);
  const totalUpdated = results.reduce((s, r) => s + r.updated, 0);

  let categorized = 0;
  let aiWarning: string | null = null;

  // Rule-based reclassification runs after all accounts are inserted (so pairs
  // across accounts are visible) and before AI categorization (so reclassified
  // rows are skipped by it). Bounded to the sync window for performance.
  const fromDate = toLocalISODate(startDate);

  // Cross-account deduplication: group internal transfers, bank-side credit card
  // bill payments, and (when the user tracks cash manually) ATM withdrawals into
  // auditable financial events, flipping their kind so spend is counted exactly
  // once. Generalizes the previous ad-hoc kind-flipping; the individual
  // matchers and confidence scoring live in src/server/lib/matching.ts.
  runMatchingStep(workspaceId, fromDate, settings.treatAtmAsTransfers);

  // ATM cash withdrawals that are NOT treated as transfers are filed under the
  // "Cash & ATM" category so they stay visible as ordinary spend.
  if (!settings.treatAtmAsTransfers) {
    const atmCategory = getCategoryByName(workspaceId, "Cash & ATM");
    if (atmCategory) {
      const atmUpdates = getUncategorizedAtmExpenses(workspaceId).flatMap((r) =>
        isAtmWithdrawal(r.description) ? [{ id: r.id, categoryId: atmCategory.id }] : [],
      );
      if (atmUpdates.length > 0) {
        batchUpdateCategories(workspaceId, atmUpdates);
        categorized += atmUpdates.length;
      }
    }
  }

  const aiProvider = createAIProvider();
  if (!aiProvider) {
    aiWarning = "AI provider not connected — new transactions weren't auto-categorized.";
  }
  if (aiProvider) {
    if (settings.aiProvider === "ollama") {
      send("stage", {
        workspaceId,
        workspaceName,
        stage: "ollama-start",
      });
      const ollamaResult = await ensureOllamaRunning(settings.ollamaUrl);
      if (!ollamaResult.ok) {
        aiWarning = ollamaResult.error ?? "Ollama is not reachable";
        console.error("[sync]", aiWarning);
      }
    }

    if (!aiWarning) {
      send("stage", {
        workspaceId,
        workspaceName,
        stage: "categorizing",
      });

      const KINDS: Array<"expense" | "income"> = ["expense", "income"];
      const BATCH_SIZE = 50;

      for (const kind of KINDS) {
        const uncategorizedIds = getUncategorizedIdsByKind(workspaceId, kind);
        if (uncategorizedIds.length === 0) continue;

        const categories = getAllCategories(workspaceId, kind);
        if (categories.length === 0) continue;
        const categoryInput = categories.map((c) => ({
          name: c.name,
          description: c.description,
        }));
        const pastCorrections = getRecentCorrections(workspaceId, kind);

        const allTxns = getTransactionsForCategorization(workspaceId, uncategorizedIds);

        const memoryMap = lookupMerchantCategoriesBulk(
          workspaceId,
          allTxns.map((t) => t.description),
        );

        const memoryUpdates: { id: number; categoryId: number }[] = [];
        const memoryKeysHit: string[] = [];
        const remainingTxns: typeof allTxns = [];
        for (const t of allTxns) {
          const m = memoryMap.get(t.description);
          if (m && m.kind === kind) {
            memoryUpdates.push({ id: t.id, categoryId: m.categoryId });
            memoryKeysHit.push(normalizeMerchant(t.description));
          } else {
            remainingTxns.push(t);
          }
        }
        if (memoryUpdates.length > 0) {
          batchUpdateCategories(workspaceId, memoryUpdates);
          incrementMerchantHits(workspaceId, memoryKeysHit);
          categorized += memoryUpdates.length;
          send("stage", {
            workspaceId,
            workspaceName,
            stage: "memory-hit",
            count: memoryUpdates.length,
            kind,
          });
        }

        for (let i = 0; i < remainingTxns.length; i += BATCH_SIZE) {
          const batch = remainingTxns.slice(i, i + BATCH_SIZE);

          try {
            const mappings = await aiProvider.categorize(
              batch.map((t) => ({
                description: t.description,
                amount: t.chargedAmount,
                currency: t.originalCurrency,
                memo: t.memo,
              })),
              categoryInput,
              { pastCorrections },
            );

            const updates: {
              id: number;
              categoryId: number;
              aiConfidence: number | null;
            }[] = [];
            const reviewFlags: { id: number; needsReview: boolean }[] = [];

            for (const m of mappings) {
              const category = categories.find((c) => c.name === m.categoryName);
              const txn = batch[m.index];
              if (!category || !txn) continue;
              const confidence = m.confidence ?? null;
              updates.push({
                id: txn.id,
                categoryId: category.id,
                aiConfidence: confidence,
              });
              reviewFlags.push({
                id: txn.id,
                needsReview: confidence == null || confidence <= 4,
              });
            }

            batchUpdateCategories(workspaceId, updates);
            batchSetNeedsReview(workspaceId, reviewFlags);
            categorized += updates.length;
          } catch (err) {
            console.error(`[sync] AI categorization batch failed (${kind}):`, err);
            if (!aiWarning) {
              aiWarning = friendlyAIError(err, settings.ollamaModel, settings.aiProvider);
            }
          }
        }
      }
    }
  }

  return {
    workspaceId,
    workspaceName,
    providers: results,
    added: totalAdded,
    updated: totalUpdated,
    categorized,
    aiWarning,
  };
}

const NOOP_SEND: SyncEventSender = () => {};

export async function runAllWorkspaces(
  filterCredentialId?: number,
  onEvent?: SyncEventSender,
  kind: SyncKind = "manual",
): Promise<WorkspaceSummary[]> {
  const send = onEvent ?? NOOP_SEND;
  markSyncStart(kind);
  try {
    const workspaceIds = listAllWorkspaceIds();
    const summaries: WorkspaceSummary[] = [];
    for (const workspaceId of workspaceIds) {
      const summary = await syncWorkspace(workspaceId, filterCredentialId, send);
      summaries.push(summary);
    }
    return summaries;
  } finally {
    markSyncEnd();
  }
}
