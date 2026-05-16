import "server-only";

import {
  getBankCredentials,
  getRequiresManualTwoFactor,
  listBankCredentials,
  updateCredentialField,
} from "@/server/db/queries/bank-credentials";
import { getAppSettings } from "@/server/db/queries/settings";
import {
  createSyncRun,
  completeSyncRun,
  failSyncRun,
} from "@/server/db/queries/sync-runs";
import {
  insertTransactions,
  getUncategorizedIdsByKind,
  getTransactionsForCategorization,
  batchUpdateCategories,
  batchSetNeedsReview,
} from "@/server/db/queries/transactions";
import {
  lookupMerchantCategoriesBulk,
  normalizeMerchant,
  incrementMerchantHits,
} from "@/server/lib/merchant-memory";
import { getAllCategories } from "@/server/db/queries/categories";
import { getRecentCorrections } from "@/server/db/queries/category-corrections";
import { scrapeBank } from "@/server/scrapers";
import {
  scrapeOneZeroFirstTime,
  scrapeOneZeroWithToken,
} from "@/server/scrapers/one-zero";
import { createAIProvider } from "@/server/ai/factory";
import { ensureOllamaRunning } from "@/server/ai/ollama-manager";
import { toLocalISODate } from "@/server/lib/date-utils";
import { listAllWorkspaceIds } from "@/server/lib/workspace-context";
import { getWorkspace } from "@/server/db/queries/workspaces";
import { BANK_PROVIDERS, type BankProvider } from "@/lib/types";
import {
  cancelOtpRequest,
  registerOtpRequest,
} from "@/server/sync/otp-bridge";
import type { ScrapeResult } from "@/server/scrapers/types";

export type SyncEventSender = (
  event: string,
  data: Record<string, unknown>
) => void;

export interface ProviderResult {
  provider: BankProvider;
  ok: boolean;
  added: number;
  updated: number;
  errorMessage?: string;
  /**
   * Set of sync-run IDs that registered an OTP bridge during this sync.
   * Surfaces so the SSE route can cancel any leftover bridges on stream abort.
   */
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

export function friendlyAIError(err: unknown, modelName: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/model.*not found|pull.*model|404/i.test(msg)) {
    return `Ollama model "${modelName}" is not installed. Run: ollama pull ${modelName}`;
  }
  if (/ECONNREFUSED|fetch failed/i.test(msg)) {
    return "Ollama is not reachable. Make sure it's installed and that no firewall is blocking port 11434.";
  }
  if (/Anthropic|api[_-]?key|401|403/i.test(msg)) {
    return "Claude API request was rejected. Check your API key in settings.";
  }
  return `AI categorization failed: ${msg}`;
}

function supportsProgrammaticTwoFactor(provider: BankProvider): boolean {
  return Boolean(
    BANK_PROVIDERS.find((b) => b.id === provider)?.supportsProgrammaticTwoFactor
  );
}

interface RunScrapeArgs {
  workspaceId: number;
  workspaceName: string;
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
        errorMessage:
          "Phone number is required to receive the One Zero 2FA code.",
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
      updateCredentialField(
        workspaceId,
        provider,
        "otpLongTermToken",
        result.otpLongTermToken
      );
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

async function syncOneProvider(
  workspaceId: number,
  workspaceName: string,
  provider: BankProvider,
  credentials: Record<string, string>,
  startDate: Date,
  send: SyncEventSender
): Promise<ProviderResult> {
  const syncRunId = createSyncRun(workspaceId, provider, toLocalISODate(startDate));
  const manualTwoFactor = getRequiresManualTwoFactor(workspaceId, provider);

  let result: ScrapeResult;
  try {
    result = await runScrapeForProvider({
      workspaceId,
      workspaceName,
      provider,
      credentials,
      startDate,
      syncRunId,
      manualTwoFactor,
      send,
    });
  } finally {
    // Defensive: ensure no bridge entry leaks if the scraper threw before
    // wait() was awaited or after it returned.
    cancelOtpRequest(syncRunId, "Scrape completed");
  }

  if (!result.success) {
    failSyncRun(syncRunId, result.errorMessage ?? "Scraping failed");
    return {
      provider,
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
    }))
  );

  const { added, updated } = insertTransactions(
    workspaceId,
    allTransactions,
    provider,
    syncRunId
  );
  completeSyncRun(syncRunId, added, updated);

  return { provider, ok: true, added, updated, syncRunId };
}

export async function syncWorkspace(
  workspaceId: number,
  filterProvider: string | undefined,
  send: SyncEventSender
): Promise<WorkspaceSummary> {
  const workspace = getWorkspace(workspaceId);
  const workspaceName = workspace?.name ?? `Workspace ${workspaceId}`;

  const providersToSync: BankProvider[] =
    filterProvider && filterProvider !== "all"
      ? [filterProvider as BankProvider]
      : listBankCredentials(workspaceId).map((c) => c.provider as BankProvider);

  if (providersToSync.length === 0) {
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
    providers: providersToSync,
    total: providersToSync.length,
  });

  const results: ProviderResult[] = [];

  for (let i = 0; i < providersToSync.length; i++) {
    const provider = providersToSync[i];

    send("provider-start", {
      workspaceId,
      workspaceName,
      provider,
      index: i,
      total: providersToSync.length,
    });

    const credentials = getBankCredentials(workspaceId, provider);
    if (!credentials) {
      send("provider-done", {
        workspaceId,
        workspaceName,
        provider,
        ok: false,
        added: 0,
        updated: 0,
        errorMessage: `No credentials configured for ${provider}`,
      });
      results.push({
        provider,
        ok: false,
        added: 0,
        updated: 0,
        errorMessage: "No credentials",
      });
      continue;
    }

    try {
      const result = await syncOneProvider(
        workspaceId,
        workspaceName,
        provider,
        credentials,
        startDate,
        send
      );
      results.push(result);
      send("provider-done", {
        workspaceId,
        workspaceName,
        provider,
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
        ok: false,
        added: 0,
        updated: 0,
        errorMessage: message,
      });
      send("provider-done", {
        workspaceId,
        workspaceName,
        provider,
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

  const aiProvider = createAIProvider();
  if (!aiProvider) {
    aiWarning =
      "AI provider not connected — new transactions weren't auto-categorized.";
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

        const allTxns = getTransactionsForCategorization(
          workspaceId,
          uncategorizedIds
        );

        const memoryMap = lookupMerchantCategoriesBulk(
          workspaceId,
          allTxns.map((t) => t.description)
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
              { pastCorrections }
            );

            const updates: {
              id: number;
              categoryId: number;
              aiConfidence: number | null;
            }[] = [];
            const reviewFlags: { id: number; needsReview: boolean }[] = [];

            for (const m of mappings) {
              const category = categories.find(
                (c) => c.name === m.categoryName
              );
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
            console.error(
              `[sync] AI categorization batch failed (${kind}):`,
              err
            );
            if (!aiWarning) {
              aiWarning = friendlyAIError(err, settings.ollamaModel);
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
  filterProvider?: string,
  onEvent?: SyncEventSender
): Promise<WorkspaceSummary[]> {
  const send = onEvent ?? NOOP_SEND;
  const workspaceIds = listAllWorkspaceIds();
  const summaries: WorkspaceSummary[] = [];
  for (const workspaceId of workspaceIds) {
    const summary = await syncWorkspace(workspaceId, filterProvider, send);
    summaries.push(summary);
  }
  return summaries;
}
