import "server-only";

import { getDb } from "../index";
import type { Category, CategoryKind } from "@/lib/types";

const CATEGORY_COLUMNS =
  "id, parent_id as parentId, name, color, icon, kind, budget_mode as budgetMode, description";

export function getAllCategories(
  workspaceId: number,
  kind?: CategoryKind,
  opts?: { leavesOnly?: boolean }
): Category[] {
  const leavesOnly = opts?.leavesOnly === true;
  const whereParts: string[] = ["workspace_id = ?"];
  const params: unknown[] = [workspaceId];

  if (kind) {
    whereParts.push("kind = ?");
    params.push(kind);
  }
  if (leavesOnly) {
    whereParts.push(
      "id NOT IN (SELECT parent_id FROM categories WHERE parent_id IS NOT NULL)"
    );
  }

  const sql = `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE ${whereParts.join(" AND ")} ORDER BY name`;
  return getDb().prepare(sql).all(...params) as Category[];
}

export function getCategoryById(
  workspaceId: number,
  id: number
): Category | null {
  return (
    (getDb()
      .prepare(
        `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE workspace_id = ? AND id = ?`
      )
      .get(workspaceId, id) as Category | undefined) ?? null
  );
}

export function getCategoryByName(
  workspaceId: number,
  name: string
): Category | null {
  return (
    (getDb()
      .prepare(
        `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE workspace_id = ? AND name = ? COLLATE NOCASE`
      )
      .get(workspaceId, name) as Category | undefined) ?? null
  );
}

/**
 * Returns the set of category ids that are parents (i.e., appear as
 * parent_id on at least one other category). Used to filter out parents
 * from AI categorization (AI must target leaves only) and to detect
 * whether a row is rendered as a rollup card on the dashboard.
 */
export function getParentIds(workspaceId: number): Set<number> {
  const rows = getDb()
    .prepare(
      "SELECT DISTINCT parent_id AS id FROM categories WHERE workspace_id = ? AND parent_id IS NOT NULL"
    )
    .all(workspaceId) as { id: number }[];
  return new Set(rows.map((r) => r.id));
}

export interface CategoryTreeNode {
  parent: Category;
  children: Category[];
}

export function getCategoryTree(
  workspaceId: number,
  kind?: CategoryKind
): { tree: CategoryTreeNode[]; orphans: Category[] } {
  const all = getAllCategories(workspaceId, kind);
  const parentIds = getParentIds(workspaceId);

  const tree: CategoryTreeNode[] = [];
  const orphans: Category[] = [];
  const childrenByParent = new Map<number, Category[]>();

  for (const c of all) {
    if (c.parentId != null) {
      const list = childrenByParent.get(c.parentId) ?? [];
      list.push(c);
      childrenByParent.set(c.parentId, list);
    }
  }

  for (const c of all) {
    if (c.parentId != null) continue;
    if (parentIds.has(c.id)) {
      tree.push({ parent: c, children: childrenByParent.get(c.id) ?? [] });
    } else {
      orphans.push(c);
    }
  }

  return { tree, orphans };
}

export function updateCategoryDescription(
  workspaceId: number,
  id: number,
  description: string | null
): boolean {
  const value = description == null ? null : description.trim() || null;
  const result = getDb()
    .prepare(
      "UPDATE categories SET description = ? WHERE workspace_id = ? AND id = ?"
    )
    .run(value, workspaceId, id);
  return result.changes > 0;
}

export function updateCategoryBudgetMode(
  workspaceId: number,
  id: number,
  mode: "budgeted" | "tracking"
): boolean {
  const result = getDb()
    .prepare(
      "UPDATE categories SET budget_mode = ? WHERE workspace_id = ? AND id = ?"
    )
    .run(mode, workspaceId, id);
  return result.changes > 0;
}

export function setBudgetModesBulk(
  workspaceId: number,
  budgetedIds: number[]
): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      "UPDATE categories SET budget_mode = 'tracking' WHERE workspace_id = ? AND kind = 'expense'"
    ).run(workspaceId);
    if (budgetedIds.length === 0) return;
    const placeholders = budgetedIds.map(() => "?").join(",");
    db.prepare(
      `UPDATE categories SET budget_mode = 'budgeted' WHERE workspace_id = ? AND id IN (${placeholders})`
    ).run(workspaceId, ...budgetedIds);
  })();
}

export type SetParentResult =
  | { ok: true; category: Category }
  | {
      ok: false;
      reason:
        | "not-found"
        | "target-not-found"
        | "not-leaf-target"
        | "kind-mismatch"
        | "child-has-children"
        | "self-parent";
    };

/**
 * Moves a category under a new parent (or to top-level when parentId is null).
 * Enforces the 2-level invariant:
 *  - target parent must itself be top-level (parent_id IS NULL)
 *  - the child being reassigned must not itself have any children
 *  - kinds must match (expense vs income trees stay separate)
 */
export function setCategoryParent(
  workspaceId: number,
  childId: number,
  parentId: number | null
): SetParentResult {
  const db = getDb();
  const child = getCategoryById(workspaceId, childId);
  if (!child) return { ok: false, reason: "not-found" };

  if (parentId != null) {
    if (parentId === childId) return { ok: false, reason: "self-parent" };

    const target = getCategoryById(workspaceId, parentId);
    if (!target) return { ok: false, reason: "target-not-found" };
    if (target.parentId !== null) {
      return { ok: false, reason: "not-leaf-target" };
    }
    if (target.kind !== child.kind) {
      return { ok: false, reason: "kind-mismatch" };
    }

    const hasOwnChildren = db
      .prepare(
        "SELECT 1 FROM categories WHERE workspace_id = ? AND parent_id = ? LIMIT 1"
      )
      .get(workspaceId, childId);
    if (hasOwnChildren) {
      return { ok: false, reason: "child-has-children" };
    }
  }

  db.prepare(
    "UPDATE categories SET parent_id = ? WHERE workspace_id = ? AND id = ?"
  ).run(parentId, workspaceId, childId);

  const updated = getCategoryById(workspaceId, childId);
  return { ok: true, category: updated as Category };
}

/**
 * Creates a new top-level (parent-eligible) category. Color is picked
 * deterministically when not supplied. Throws if a category with the same
 * name already exists in the workspace (UNIQUE constraint).
 */
export function createParentCategory(
  workspaceId: number,
  input: {
    name: string;
    kind: CategoryKind;
    color?: string;
    icon?: string;
    description?: string | null;
  }
): Category {
  const trimmed = input.name.trim();
  const color = input.color ?? pickColor(trimmed.toLowerCase());
  const icon = input.icon ?? "circle-dot";
  const description = input.description?.trim() || null;

  const result = getDb()
    .prepare(
      "INSERT INTO categories (workspace_id, parent_id, name, color, icon, kind, description) VALUES (?, NULL, ?, ?, ?, ?, ?)"
    )
    .run(workspaceId, trimmed, color, icon, input.kind, description);

  return {
    id: Number(result.lastInsertRowid),
    parentId: null,
    name: trimmed,
    color,
    icon,
    kind: input.kind,
    budgetMode: "budgeted",
    description,
  };
}

/**
 * Hard-coded parent assignments for the seeded expense categories. Mirrors
 * migration 017_seed_category_parents.sql so that AI-proposed categories
 * with names matching a known leaf get auto-grouped at creation time. New
 * names (truly novel proposals) stay as orphan leaves; the user can either
 * leave them ungrouped or reassign in Settings.
 */
export const SEEDED_CATEGORY_PARENTS: Record<string, string> = {
  Groceries: "Food",
  Restaurants: "Food",
  "Coffee & Cafes": "Food",
  Transport: "Transportation",
  Travel: "Transportation",
  Shopping: "Lifestyle",
  Entertainment: "Lifestyle",
  "Personal Care": "Lifestyle",
  "Sports & Hobbies": "Lifestyle",
  "Bills & Utilities": "Home & Bills",
  Home: "Home & Bills",
  Insurance: "Home & Bills",
  Subscriptions: "Home & Bills",
  Health: "Health & Family",
  Education: "Health & Family",
  "Kids & Childcare": "Health & Family",
  "Pet Care": "Health & Family",
  "Cash & ATM": "Money Movement",
  Transfers: "Money Movement",
  "Gifts & Donations": "Money Movement",
  "Fees & Taxes": "Money Movement",
};

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
 * Returns the category record (existing or newly created). When the name
 * appears in SEEDED_CATEGORY_PARENTS, the new row is auto-attached to the
 * matching parent in the same workspace. Otherwise the category is a
 * top-level leaf; the user can reassign later via Settings.
 */
export function ensureCategory(
  workspaceId: number,
  name: string,
  icon = "circle-dot",
  kind: CategoryKind = "expense"
): Category {
  const trimmed = name.trim();
  const existing = getCategoryByName(workspaceId, trimmed);
  if (existing) return existing;

  const parentName = SEEDED_CATEGORY_PARENTS[trimmed];
  let parentId: number | null = null;
  if (parentName) {
    const parent = getCategoryByName(workspaceId, parentName);
    if (parent && parent.parentId === null) parentId = parent.id;
  }

  const color = pickColor(trimmed.toLowerCase());
  const result = getDb()
    .prepare(
      "INSERT INTO categories (workspace_id, parent_id, name, color, icon, kind) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(workspaceId, parentId, trimmed, color, icon, kind);

  return {
    id: Number(result.lastInsertRowid),
    parentId,
    name: trimmed,
    color,
    icon,
    kind,
    budgetMode: "budgeted",
    description: null,
  };
}
