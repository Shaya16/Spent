import "server-only";

import { GoogleGenAI } from "@google/genai";
import { parseCategorizationResponse } from "../lib/parse-response";
import { buildCategorizationPrompt, SYSTEM_PROMPT } from "../prompts";
import type {
  AIProvider,
  CategoryForCategorization,
  CategoryMapping,
  PastCorrection,
  TransactionForCategorization,
} from "../types";

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async categorize(
    transactions: TransactionForCategorization[],
    categories: CategoryForCategorization[],
    options?: { allowProposals?: boolean; pastCorrections?: PastCorrection[] },
  ): Promise<CategoryMapping[]> {
    const allowProposals = options?.allowProposals ?? false;
    const prompt = buildCategorizationPrompt(
      transactions,
      categories,
      allowProposals,
      options?.pastCorrections ?? [],
    );

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
      },
    });

    return parseCategorizationResponse(
      response.text ?? "",
      categories.map((c) => c.name),
      allowProposals,
    );
  }
}
