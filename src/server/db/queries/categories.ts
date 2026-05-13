import "server-only";

import { getDb } from "../index";
import type { Category, CategoryKind } from "@/lib/types";

export function getAllCategories(kind?: CategoryKind): Category[] {
  if (kind) {
    return getDb()
      .prepare(
        "SELECT id, name, color, icon, kind FROM categories WHERE kind = ? ORDER BY name"
      )
      .all(kind) as Category[];
  }
  return getDb()
    .prepare("SELECT id, name, color, icon, kind FROM categories ORDER BY name")
    .all() as Category[];
}

export function getCategoryByName(name: string): Category | null {
  return (
    (getDb()
      .prepare(
        "SELECT id, name, color, icon, kind FROM categories WHERE name = ? COLLATE NOCASE"
      )
      .get(name) as Category | undefined) ?? null
  );
}

// Palette for AI-proposed new categories. Distinct hues, none colliding
// with the 16 seeded category colors. Picked deterministically via a hash
// of the category name so the same proposal always gets the same color.
// Chroma matched to the L2 buttercream lift.
const NEW_CATEGORY_PALETTE = [
  "#A4C386", // light olive
  "#E7A875", // sandy orange
  "#65C1D1", // light cyan-blue
  "#D692BF", // bright pink
  "#9186D1", // medium violet
  "#73C4A8", // jade
  "#7D90CA", // dusty indigo
  "#A2ABBB", // medium slate
  "#BF9ED9", // mauve
  "#92D5B7", // mint
  "#D6C480", // sand gold
  "#BFB89B", // sage tan
] as const;

function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % NEW_CATEGORY_PALETTE.length;
  return NEW_CATEGORY_PALETTE[idx];
}

/**
 * Create a category if it doesn't already exist (case-insensitive).
 * Returns the category record (existing or newly created).
 */
export function ensureCategory(
  name: string,
  icon = "circle-dot",
  kind: CategoryKind = "expense"
): Category {
  const trimmed = name.trim();
  const existing = getCategoryByName(trimmed);
  if (existing) return existing;

  const color = pickColor(trimmed.toLowerCase());
  const result = getDb()
    .prepare(
      "INSERT INTO categories (name, color, icon, kind) VALUES (?, ?, ?, ?)"
    )
    .run(trimmed, color, icon, kind);

  return {
    id: Number(result.lastInsertRowid),
    name: trimmed,
    color,
    icon,
    kind,
  };
}
