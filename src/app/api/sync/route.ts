import {
  getBankCredentials,
  listBankCredentials,
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
import { createAIProvider } from "@/server/ai/factory";
import { ensureOllamaRunning } from "@/server/ai/ollama-manager";
import { toLocalISODate } from "@/server/lib/date-utils";
import {
  getWorkspaceIdFromRequest,
  hasWorkspaceHeader,
  listAllWorkspaceIds,
} from "@/server/lib/workspace-context";
import { getWorkspace } from "@/server/db/queries/workspaces";
import type { BankProvider } from "@/lib/types";

function sseEvent(
  event: string,
  data: Record<string, unknown>
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function friendlyAIError(err: unknown, modelName: string): string {
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

interface ProviderResult {
  provider: BankProvider;
  ok: boolean;
  added: number;
  updated: number;
  errorMessage?: string;
}

interface WorkspaceSummary {
  workspaceId: number;
  workspaceName: string;
  providers: ProviderResult[];
  added: number;
  updated: number;
  categorized: number;
  aiWarning: string | null;
}

async function syncOneProvider(
  workspaceId: number,
  provider: BankProvider,
  credentials: Record<string, string>,
  startDate: Date
): Promise<ProviderResult> {
  const syncRunId = createSyncRun(workspaceId, provider, toLocalISODate(startDate));

  const result = await scrapeBank(workspaceId, provider, credentials, startDate);

  if (!result.success) {
    failSyncRun(syncRunId, result.errorMessage ?? "Scraping failed");
    return {
      provider,
      ok: false,
      added: 0,
      updated: 0,
      errorMessage: result.errorMessage ?? "Scraping failed",
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

  return { provider, ok: true, added, updated };
}

async function syncWorkspace(
  workspaceId: number,
  filterProvider: string | undefined,
  send: (event: string, data: Record<string, unknown>) => void
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
        provider,
        credentials,
        startDate
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
                needsReview: confidence == null || confidence <= 3,
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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    provider?: string;
  };

  // When the request includes X-Workspace-ID we sync only that workspace
  // (the in-app "Sync now" button). When it's absent we treat it as a
  // multi-workspace trigger from the menubar and sync every workspace.
  const headerPresent = hasWorkspaceHeader(request);
  const workspaceIds = headerPresent
    ? [getWorkspaceIdFromRequest(request)]
    : listAllWorkspaceIds();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      try {
        const summaries: WorkspaceSummary[] = [];
        for (const workspaceId of workspaceIds) {
          const summary = await syncWorkspace(workspaceId, body.provider, send);
          summaries.push(summary);
        }

        const totalAdded = summaries.reduce((s, w) => s + w.added, 0);
        const totalUpdated = summaries.reduce((s, w) => s + w.updated, 0);
        const totalCategorized = summaries.reduce(
          (s, w) => s + w.categorized,
          0
        );
        const firstWarning = summaries.find((w) => w.aiWarning)?.aiWarning ?? null;

        if (headerPresent && summaries.length === 1) {
          // Back-compat shape for the in-app sync UI which expects flat fields.
          const only = summaries[0];
          send("complete", {
            providers: only.providers,
            added: only.added,
            updated: only.updated,
            categorized: only.categorized,
            aiWarning: only.aiWarning,
            workspaceId: only.workspaceId,
            workspaceName: only.workspaceName,
          });
        } else {
          send("complete", {
            workspaces: summaries,
            added: totalAdded,
            updated: totalUpdated,
            categorized: totalCategorized,
            aiWarning: firstWarning,
          });
        }
      } catch (error) {
        console.error("[sync] unexpected error in sync route:", error);
        const message =
          error instanceof Error
            ? error.message.replace(/\b\d{5,}\b/g, "[REDACTED]")
            : "An unexpected error occurred";
        send("error", { message });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
