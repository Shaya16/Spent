import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, CategoryMapping, TransactionForCategorization } from "../types";
import { buildCategorizationPrompt, SYSTEM_PROMPT } from "../prompts";

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async categorize(
    transactions: TransactionForCategorization[],
    categoryNames: string[],
    options?: { allowProposals?: boolean }
  ): Promise<CategoryMapping[]> {
    const allowProposals = options?.allowProposals ?? false;
    const prompt = buildCategorizationPrompt(
      transactions,
      categoryNames,
      allowProposals
    );

    const response = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return parseResponse(text, categoryNames, allowProposals);
  }
}

function parseResponse(
  text: string,
  validCategories: string[],
  allowProposals: boolean
): CategoryMapping[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

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
    const typed = item as { index: number; categoryName: string };
    const name = typed.categoryName.trim();
    const isExisting = validSet.has(name.toLowerCase());
    if (!isExisting && !allowProposals) continue;
    results.push({
      index: typed.index,
      categoryName: name,
      isNew: !isExisting,
    });
  }
  return results;
}
