import "server-only";

import OpenAI from "openai";
import type {
  AIProvider,
  CategoryForCategorization,
  CategoryMapping,
  PastCorrection,
  TransactionForCategorization,
} from "../types";
import { buildCategorizationPrompt, SYSTEM_PROMPT } from "../prompts";
import { parseCategorizationResponse } from "../parse-categorization-response";

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string
  ) {
    this.client = new OpenAI({ apiKey });
  }

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

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 4096,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";

    return parseCategorizationResponse(
      text,
      categories.map((c) => c.name),
      allowProposals
    );
  }
}
