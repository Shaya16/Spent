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
    categoryNames: string[]
  ): Promise<CategoryMapping[]> {
    const prompt = buildCategorizationPrompt(transactions, categoryNames);

    const response = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return parseResponse(text, categoryNames);
  }
}

function parseResponse(
  text: string,
  validCategories: string[]
): CategoryMapping[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const parsed: unknown[] = JSON.parse(jsonMatch[0]);
  const validSet = new Set(validCategories);

  return parsed
    .filter(
      (item): item is { index: number; categoryName: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).index === "number" &&
        typeof (item as Record<string, unknown>).categoryName === "string" &&
        validSet.has((item as Record<string, unknown>).categoryName as string)
    )
    .map((item) => ({
      index: item.index,
      categoryName: item.categoryName,
    }));
}
