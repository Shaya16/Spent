import "server-only";

import { getDb } from "../index";
import type { Category } from "@/lib/types";

export function getAllCategories(): Category[] {
  return getDb().prepare("SELECT id, name, color, icon FROM categories ORDER BY name").all() as Category[];
}

export function getCategoryByName(name: string): Category | null {
  return (
    (getDb()
      .prepare("SELECT id, name, color, icon FROM categories WHERE name = ?")
      .get(name) as Category | undefined) ?? null
  );
}
