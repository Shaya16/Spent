"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { applyCategorize, getCategories } from "@/lib/api";
import { toast } from "sonner";
import type { CategorizePreview } from "@/lib/api";

interface CategorizeReviewDialogProps {
  preview: CategorizePreview;
  onClose: () => void;
  onApplied: () => void;
}

export function CategorizeReviewDialog({
  preview,
  onClose,
  onApplied,
}: CategorizeReviewDialogProps) {
  const { data: existingCategories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });

  // Track per-proposal state: approved (default true), or a fallback name.
  const [approvedMap, setApprovedMap] = useState<Record<string, boolean>>(
    () => Object.fromEntries(preview.proposedCategories.map((p) => [p.name, true]))
  );

  const applyMutation = useMutation({
    mutationFn: () =>
      applyCategorize({
        assignments: preview.assignments.map((a) => ({
          transactionId: a.transactionId,
          categoryName: a.categoryName,
          isNew: a.isNew,
          kind: a.kind,
        })),
        approvedNewCategoryNames: Object.entries(approvedMap)
          .filter(([, ok]) => ok)
          .map(([name]) => name),
      }),
    onSuccess: (data) => {
      toast.success(
        `Applied to ${data.appliedCount} transaction${data.appliedCount === 1 ? "" : "s"}` +
          (data.createdCategoriesCount > 0
            ? ` · Added ${data.createdCategoriesCount} new categor${data.createdCategoriesCount === 1 ? "y" : "ies"}`
            : "")
      );
      onApplied();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    },
  });

  const approvedCount = useMemo(
    () => Object.values(approvedMap).filter(Boolean).length,
    [approvedMap]
  );
  const totalProposals = preview.proposedCategories.length;

  // How many transactions will land in an existing category, in a new (approved)
  // category, or stay uncategorized.
  const stats = useMemo(() => {
    let toExisting = 0;
    let toNew = 0;
    let willStay = 0;
    for (const a of preview.assignments) {
      if (!a.isNew) toExisting++;
      else if (approvedMap[a.categoryName]) toNew++;
      else willStay++;
    }
    return { toExisting, toNew, willStay };
  }, [preview.assignments, approvedMap]);

  const sortedExistingUsage = useMemo(
    () =>
      Object.entries(preview.existingCategoryUsage)
        .map(([name, count]) => ({
          name,
          count,
          color:
            existingCategories.find((c) => c.name === name)?.color ?? "#B1AA9C",
        }))
        .sort((a, b) => b.count - a.count),
    [preview.existingCategoryUsage, existingCategories]
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pb-3 pt-6">
          <DialogTitle className="font-serif text-2xl tracking-tight">
            AI categorization
          </DialogTitle>
          <DialogDescription>
            Suggested categories for {preview.uncategorizedCount} uncategorized{" "}
            {preview.uncategorizedCount === 1 ? "transaction" : "transactions"}.
            Approve or reject any new categories before applying.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] px-6">
          <div className="space-y-6 pb-4">
            {sortedExistingUsage.length > 0 && (
              <section>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  Using existing categories ({stats.toExisting})
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {sortedExistingUsage.map((c) => (
                    <span
                      key={c.name}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">{c.count}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {totalProposals > 0 ? (
              <section>
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    Proposed new categories ({totalProposals})
                  </h3>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() =>
                        setApprovedMap(
                          Object.fromEntries(
                            preview.proposedCategories.map((p) => [
                              p.name,
                              true,
                            ])
                          )
                        )
                      }
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Approve all
                    </button>
                    <span className="text-xs text-muted-foreground">·</span>
                    <button
                      onClick={() =>
                        setApprovedMap(
                          Object.fromEntries(
                            preview.proposedCategories.map((p) => [
                              p.name,
                              false,
                            ])
                          )
                        )
                      }
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Reject all
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {preview.proposedCategories.map((p) => (
                    <ProposalRow
                      key={p.name}
                      proposal={p}
                      approved={approvedMap[p.name] ?? false}
                      onToggle={(v) =>
                        setApprovedMap((prev) => ({ ...prev, [p.name]: v }))
                      }
                    />
                  ))}
                </div>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">
                The AI didn&apos;t propose any new categories. Everything fits in
                your existing list.
              </p>
            )}

            {preview.errors && preview.errors.length > 0 && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {preview.errors.length} batch
                {preview.errors.length === 1 ? "" : "es"} failed during AI
                categorization. Other transactions were still processed.
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t bg-muted/30 px-6 py-4">
          <div className="mr-auto flex flex-col gap-0.5 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">
                {stats.toExisting + stats.toNew}
              </span>{" "}
              will be categorized
              {stats.willStay > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span className="text-foreground">{stats.willStay}</span> will
                  stay uncategorized
                </>
              )}
            </div>
            {totalProposals > 0 && (
              <div>
                <span className="font-medium text-foreground">
                  {approvedCount}
                </span>{" "}
                of {totalProposals} new categor
                {totalProposals === 1 ? "y" : "ies"} will be created
              </div>
            )}
          </div>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => applyMutation.mutate()}
            disabled={applyMutation.isPending}
          >
            {applyMutation.isPending ? "Applying..." : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProposalRow({
  proposal,
  approved,
  onToggle,
}: {
  proposal: { name: string; transactionIds: number[]; samples: string[] };
  approved: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-xl border p-3 transition-colors ${
        approved ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold tracking-tight">
            {proposal.name}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {proposal.transactionIds.length} transaction
            {proposal.transactionIds.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {proposal.samples.join(" · ")}
        </div>
      </div>
      <Switch
        checked={approved}
        onCheckedChange={onToggle}
        aria-label={`Approve "${proposal.name}"`}
      />
    </div>
  );
}
