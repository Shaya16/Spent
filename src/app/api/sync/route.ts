import { getBankCredentials } from "@/server/db/queries/bank-credentials";
import { getAppSettings } from "@/server/db/queries/settings";
import {
  createSyncRun,
  completeSyncRun,
  failSyncRun,
} from "@/server/db/queries/sync-runs";
import {
  insertTransactions,
  getUncategorizedTransactionIds,
  getTransactionsForCategorization,
  batchUpdateCategories,
} from "@/server/db/queries/transactions";
import { getAllCategories } from "@/server/db/queries/categories";
import { scrapeBank } from "@/server/scrapers";
import { createAIProvider } from "@/server/ai/factory";
import { ensureOllamaRunning } from "@/server/ai/ollama-manager";
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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    provider?: string;
  };
  const provider = (body.provider ?? "isracard") as BankProvider;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      try {
        const credentials = getBankCredentials(provider);
        if (!credentials) {
          send("error", { message: "No credentials configured. Run setup first." });
          controller.close();
          return;
        }

        const settings = getAppSettings();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - settings.monthsToSync);

        send("progress", {
          stage: "connecting",
          message: `Connecting to ${provider}...`,
        });

        const syncRunId = createSyncRun(
          provider,
          startDate.toISOString().slice(0, 10)
        );

        send("progress", {
          stage: "scraping",
          message: "Scraping transactions...",
        });

        const result = await scrapeBank(provider, credentials, startDate);

        if (!result.success) {
          failSyncRun(syncRunId, result.errorMessage ?? "Scraping failed");
          send("error", { message: result.errorMessage ?? "Scraping failed" });
          controller.close();
          return;
        }

        const allTransactions = result.accounts.flatMap((account) =>
          account.transactions.map((txn) => ({
            accountNumber: account.accountNumber,
            ...txn,
            installmentNumber: txn.installments?.number,
            installmentTotal: txn.installments?.total,
          }))
        );

        send("progress", {
          stage: "processing",
          message: `Processing ${allTransactions.length} transactions...`,
        });

        const { added, updated } = insertTransactions(
          allTransactions,
          provider,
          syncRunId
        );

        let categorized = 0;
        let aiWarning: string | null = null;

        const aiProvider = createAIProvider();
        if (aiProvider) {
          const aiSettings = settings.aiProvider;

          if (aiSettings === "ollama") {
            send("progress", {
              stage: "categorizing",
              message: "Starting Ollama...",
            });

            const ollamaResult = await ensureOllamaRunning(settings.ollamaUrl);
            if (!ollamaResult.ok) {
              aiWarning = ollamaResult.error ?? "Ollama is not reachable";
              console.error("[sync]", aiWarning);
            }
          }

          if (!aiWarning) {
            send("progress", {
              stage: "categorizing",
              message: "Categorizing new transactions with AI...",
            });

            const uncategorizedIds = getUncategorizedTransactionIds();
            if (uncategorizedIds.length > 0) {
              const categories = getAllCategories();
              const categoryNames = categories.map((c) => c.name);
              const BATCH_SIZE = 50;

              for (let i = 0; i < uncategorizedIds.length; i += BATCH_SIZE) {
                const batchIds = uncategorizedIds.slice(i, i + BATCH_SIZE);
                const txns = getTransactionsForCategorization(batchIds);

                try {
                  const mappings = await aiProvider.categorize(
                    txns.map((t) => ({
                      description: t.description,
                      amount: t.chargedAmount,
                      currency: t.originalCurrency,
                      memo: t.memo,
                    })),
                    categoryNames
                  );

                  const updates = mappings
                    .map((m) => {
                      const category = categories.find(
                        (c) => c.name === m.categoryName
                      );
                      const txn = txns[m.index];
                      if (!category || !txn) return null;
                      return { id: txn.id, categoryId: category.id };
                    })
                    .filter(
                      (u): u is { id: number; categoryId: number } =>
                        u !== null
                    );

                  batchUpdateCategories(updates);
                  categorized += updates.length;
                } catch (err) {
                  console.error("[sync] AI categorization batch failed:", err);
                  if (!aiWarning) {
                    aiWarning = friendlyAIError(err, settings.ollamaModel);
                  }
                }
              }
            }
          }
        }

        completeSyncRun(syncRunId, added, updated);

        send("progress", { stage: "done", message: "Sync complete" });
        send("complete", {
          syncRunId,
          added,
          updated,
          categorized,
          aiWarning,
        });
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
