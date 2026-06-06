import "server-only";

import { asc, eq } from "drizzle-orm";
import { getOrm } from "../db/orm";
import { workspaces } from "../db/schema";

const HEADER = "x-workspace-id";

export function hasWorkspaceHeader(req: Request): boolean {
  return req.headers.get(HEADER) != null;
}

export function getWorkspaceIdFromRequest(req: Request): number {
  const header = req.headers.get(HEADER);
  if (header) {
    const id = Number(header);
    if (Number.isInteger(id) && id > 0) {
      const row = getOrm()
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, id))
        .get();
      if (row) return row.id;
    }
  }
  const row = getOrm()
    .select({ id: workspaces.id })
    .from(workspaces)
    .orderBy(asc(workspaces.id))
    .limit(1)
    .get();
  if (!row) {
    throw new Error("No workspace exists. Migration 013_workspaces did not run.");
  }
  return row.id;
}

export function listAllWorkspaceIds(): number[] {
  return getOrm()
    .select({ id: workspaces.id })
    .from(workspaces)
    .orderBy(asc(workspaces.id))
    .all()
    .map((r) => r.id);
}
