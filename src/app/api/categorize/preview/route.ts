import { NextResponse } from "next/server";
import {
  getUncategorizedIdsByKind,
  getTransactionsForCategorization,
} from "@/server/db/queries/transactions";
import { getAllCategories } from "@/server/db/queries/categories";
import { createAIProvider } from "@/server/ai/factory";
import { ensureOllamaRunning } from "@/server/ai/ollama-manager";
import { getAppSettings } from "@/server/db/queries/settings";
import type { CategoryMapping } from "@/server/ai/types";
import type { CategoryKind } from "@/lib/types";

/**
 * Preview mode: run AI categorization with proposal-enabled prompt, split by
 * expense vs income so each transaction is offered categories of its own kind.
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

  const KINDS: CategoryKind[] = ["expense", "income"];
  const BATCH_SIZE = 50;

  const allMappings: Array<{
    transactionId: number;
    description: string;
    categoryName: string;
    isNew: boolean;
    kind: CategoryKind;
  }> = [];
  const errors: string[] = [];
  let totalUncategorized = 0;

  for (const kind of KINDS) {
    const ids = getUncategorizedIdsByKind(kind);
    totalUncategorized += ids.length;
    if (ids.length === 0) continue;

    const categories = getAllCategories(kind);
    if (categories.length === 0) continue;
    const categoryNames = categories.map((c) => c.name);

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batchIds = ids.slice(i, i + BATCH_SIZE);
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
            kind,
          });
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Unknown AI error");
      }
    }
  }

  const proposalMap = new Map<
    string,
    {
      name: string;
      kind: CategoryKind;
      transactionIds: number[];
      samples: string[];
    }
  >();
  const existingUsage = new Map<string, number>();

  for (const m of allMappings) {
    if (m.isNew) {
      const key = `${m.kind}::${m.categoryName}`;
      const entry = proposalMap.get(key) ?? {
        name: m.categoryName,
        kind: m.kind,
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
    uncategorizedCount: totalUncategorized,
    assignments: allMappings,
    proposedCategories: Array.from(proposalMap.values()).sort(
      (a, b) => b.transactionIds.length - a.transactionIds.length
    ),
    existingCategoryUsage: Object.fromEntries(existingUsage),
    errors,
  });
}
