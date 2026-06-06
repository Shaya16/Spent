import type { CategoryMapping } from "../types";

function parseConfidence(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const clamped = Math.round(n);
  if (clamped < 1 || clamped > 7) return undefined;
  return clamped;
}

export function parseCategorizationResponse(
  text: string,
  validCategories: string[],
  allowProposals: boolean,
): CategoryMapping[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let parsed: unknown[];
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

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
}
