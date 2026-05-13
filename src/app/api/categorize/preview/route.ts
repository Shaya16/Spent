import { NextResponse } from "next/server";
import {
  getUncategorizedTransactionIds,
  getTransactionsForCategorization,
} from "@/server/db/queries/transactions";
import { getAllCategories } from "@/server/db/queries/categories";
import { createAIProvider } from "@/server/ai/factory";
import { ensureOllamaRunning } from "@/server/ai/ollama-manager";
import { getAppSettings } from "@/server/db/queries/settings";
import type { CategoryMapping } from "@/server/ai/types";

/**
 * Preview mode: run AI categorization with proposal-enabled prompt.
 * Returns category mappings + suggested new categories with sample transactions.
 * Does NOT write to the DB.
 */
export async function POST() {
  const settings = getAppSettings();

  const aiProvider = createAIProvider();
  if (!aiProvider) {
    return NextResponse.json(
      {
        error:
          "AI provider isn't configured. Set it up in Settings → AI & automation.",
      },
      { status: 400 }
    );
  }

  if (settings.aiProvider === "ollama") {
    const status = await ensureOllamaRunning(settings.ollamaUrl);
    if (!status.ok) {
      return NextResponse.json(
        { error: status.error ?? "Ollama isn't reachable." },
        { status: 503 }
      );
    }
  }

  const uncategorizedIds = getUncategorizedTransactionIds();
  if (uncategorizedIds.length === 0) {
    return NextResponse.json({
      uncategorizedCount: 0,
      assignments: [],
      proposedCategories: [],
      existingCategoryUsage: {},
    });
  }

  const categories = getAllCategories();
  const categoryNames = categories.map((c) => c.name);
  const BATCH_SIZE = 50;

  const allMappings: Array<{
    transactionId: number;
    description: string;
    categoryName: string;
    isNew: boolean;
  }> = [];
  const errors: string[] = [];

  for (let i = 0; i < uncategorizedIds.length; i += BATCH_SIZE) {
    const batchIds = uncategorizedIds.slice(i, i + BATCH_SIZE);
    const txns = getTransactionsForCategorization(batchIds);

    try {
      const mappings: CategoryMapping[] = await aiProvider.categorize(
        txns.map((t) => ({
          description: t.description,
          amount: t.chargedAmount,
          currency: t.originalCurrency,
          memo: t.memo,
        })),
        categoryNames,
        { allowProposals: true }
      );

      for (const m of mappings) {
        const txn = txns[m.index];
        if (!txn) continue;
        allMappings.push({
          transactionId: txn.id,
          description: txn.description,
          categoryName: m.categoryName,
          isNew: !!m.isNew,
        });
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Unknown AI error");
    }
  }

  // Group proposed new categories with sample transactions.
  const proposalMap = new Map<
    string,
    {
      name: string;
      transactionIds: number[];
      samples: string[];
    }
  >();

  // Track existing category usage too, for the review UI.
  const existingUsage = new Map<string, number>();

  for (const m of allMappings) {
    if (m.isNew) {
      const key = m.categoryName;
      const entry = proposalMap.get(key) ?? {
        name: m.categoryName,
        transactionIds: [],
        samples: [],
      };
      entry.transactionIds.push(m.transactionId);
      if (entry.samples.length < 4 && !entry.samples.includes(m.description)) {
        entry.samples.push(m.description);
      }
      proposalMap.set(key, entry);
    } else {
      existingUsage.set(
        m.categoryName,
        (existingUsage.get(m.categoryName) ?? 0) + 1
      );
    }
  }

  return NextResponse.json({
    uncategorizedCount: uncategorizedIds.length,
    assignments: allMappings,
    proposedCategories: Array.from(proposalMap.values()).sort(
      (a, b) => b.transactionIds.length - a.transactionIds.length
    ),
    existingCategoryUsage: Object.fromEntries(existingUsage),
    errors,
  });
}
