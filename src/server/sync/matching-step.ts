import "server-only";

import { applyProposedEvents, getMatchSettingsMap } from "@/server/db/queries/financial-events";
import { getMatchCandidates } from "@/server/db/queries/transactions";
import { proposeEvents } from "@/server/lib/matching";

// Cross-account deduplication step, run once per workspace after all accounts are
// inserted (so both legs of a transfer are visible) and before AI categorization
// (so grouped rows are skipped). Bounded to the sync window for performance and
// idempotent across re-syncs (getMatchCandidates skips already-grouped rows and
// applyProposedEvents skips existing or rejected event keys).
export function runMatchingStep(
  workspaceId: number,
  fromDate: string,
  treatAtmAsTransfers: boolean,
): void {
  const candidates = getMatchCandidates(workspaceId, fromDate);
  if (candidates.length === 0) return;
  const settings = getMatchSettingsMap(workspaceId);
  const proposals = proposeEvents(candidates, settings, { treatAtmAsTransfers });
  applyProposedEvents(workspaceId, proposals);
}
