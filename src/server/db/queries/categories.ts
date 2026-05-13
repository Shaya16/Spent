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

const NEW_CATEGORY_PALETTE = [
  "#A5C9A1",
  "#E8B58A",
  "#9CB8D0",
  "#C0A8D1",
  "#D5A88E",
  "#A0C0B0",
  "#BFB58A",
  "#D0A5A8",
  "#B8B0C9",
  "#C9B89B",
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
