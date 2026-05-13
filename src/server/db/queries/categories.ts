import "server-only";

import { getDb } from "../index";
import type { Category } from "@/lib/types";

export function getAllCategories(): Category[] {
  return getDb().prepare("SELECT id, name, color, icon FROM categories ORDER BY name").all() as Category[];
}

export function getCategoryByName(name: string): Category | null {
  return (
    (getDb()
      .prepare(
        "SELECT id, name, color, icon FROM categories WHERE name = ? COLLATE NOCASE"
      )
      .get(name) as Category | undefined) ?? null
  );
}

// Palette for AI-proposed new categories. Distinct hues, none colliding
// with the 16 seeded category colors. Picked deterministically via a hash
// of the category name so the same proposal always gets the same color.
const NEW_CATEGORY_PALETTE = [
  "#A8C58E", // light olive
  "#E8BB85", // sandy orange
  "#7FBFD3", // light cyan-blue
  "#D78AC4", // bright pink
  "#A47CC9", // medium violet
  "#74C2AC", // jade
  "#8990C9", // dusty indigo
  "#A9B0BC", // medium slate
  "#C2A1D9", // mauve
  "#82CFBE", // mint
  "#E5C781", // sand gold
  "#C2BB9F", // sage tan
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
export function ensureCategory(name: string, icon = "circle-dot"): Category {
  const trimmed = name.trim();
  const existing = getCategoryByName(trimmed);
  if (existing) return existing;

  const color = pickColor(trimmed.toLowerCase());
  const result = getDb()
    .prepare(
      "INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)"
    )
    .run(trimmed, color, icon);

  return {
    id: Number(result.lastInsertRowid),
    name: trimmed,
    color,
    icon,
  };
}
