import "server-only";

import type {
  AIProvider,
  CategoryForCategorization,
  CategoryMapping,
  PastCorrection,
  TransactionForCategorization,
} from "../types";
import { buildCategorizationPrompt, SYSTEM_PROMPT } from "../prompts";

function parseConfidence(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const clamped = Math.round(n);
  if (clamped < 1 || clamped > 7) return undefined;
  return clamped;
}

export class OllamaProvider implements AIProvider {
  constructor(
    private baseUrl: string,
    private model: string
  ) {}

  async categorize(
    transactions: TransactionForCategorization[],
    categories: CategoryForCategorization[],
    options?: { allowProposals?: boolean; pastCorrections?: PastCorrection[] }
  ): Promise<CategoryMapping[]> {
    const allowProposals = options?.allowProposals ?? false;
    const pastCorrections = options?.pastCorrections ?? [];
    const prompt = buildCategorizationPrompt(
      transactions,
      categories,
      allowProposals,
      pastCorrections
    );

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      message?: { content?: string };
    };
    const text = data.message?.content ?? "";

    return parseResponse(text, categories.map((c) => c.name), allowProposals);
  }
}

function parseResponse(
  text: string,
  validCategories: string[],
  allowProposals: boolean
): CategoryMapping[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed: unknown[] = JSON.parse(jsonMatch[0]);
    const validSet = new Set(validCategories.map((c) => c.toLowerCase()));
    const results: CategoryMapping[] = [];
    for (const item of parsed) {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as Record<string, unknown>).index !== "number" ||
        typeof (item as Record<string, unknown>).categoryName !== "string"
      ) {
        continue;
      }
      const typed = item as {
        index: number;
        categoryName: string;
        confidence?: unknown;
      };
      const name = typed.categoryName.trim();
      const isExisting = validSet.has(name.toLowerCase());
      if (!isExisting && !allowProposals) continue;
      results.push({
        index: typed.index,
        categoryName: name,
        isNew: !isExisting,
        confidence: parseConfidence(typed.confidence),
      });
    }
    return results;
  } catch {
    return [];
  }
}
