import "server-only";

import type { AIProvider, CategoryMapping, TransactionForCategorization } from "../types";
import { buildCategorizationPrompt, SYSTEM_PROMPT } from "../prompts";

export class OllamaProvider implements AIProvider {
  constructor(
    private baseUrl: string,
    private model: string
  ) {}

  async categorize(
    transactions: TransactionForCategorization[],
    categoryNames: string[]
  ): Promise<CategoryMapping[]> {
    const prompt = buildCategorizationPrompt(transactions, categoryNames);

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

    return parseResponse(text, categoryNames);
  }
}

function parseResponse(
  text: string,
  validCategories: string[]
): CategoryMapping[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed: unknown[] = JSON.parse(jsonMatch[0]);
    const validSet = new Set(validCategories);

    return parsed
      .filter(
        (item): item is { index: number; categoryName: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).index === "number" &&
          typeof (item as Record<string, unknown>).categoryName === "string" &&
          validSet.has(
            (item as Record<string, unknown>).categoryName as string
          )
      )
      .map((item) => ({
        index: item.index,
        categoryName: item.categoryName,
      }));
  } catch {
    return [];
  }
}
