"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input, InputGroup } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCategories,
  setCategoryParent,
  updateBudget,
  updateCategoryBudgetMode,
  updateCategoryDescription,
} from "@/lib/api";
import type { Category, CategoryWithData } from "@/lib/types";

const NONE_VALUE = "__none__";
const DESCRIPTION_MAX = 500;

export interface CategoryDetailSheetProps {
  categoryId: number | null;
  data: CategoryWithData | null;
  onClose: () => void;
}

export function CategoryDetailSheet({
  categoryId,
  data,
  onClose,
}: CategoryDetailSheetProps) {
  const open = categoryId !== null;
  const { data: allCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
    enabled: open,
  });
  const category = useMemo(
    () => allCategories?.find((c) => c.id === categoryId) ?? null,
    [allCategories, categoryId]
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-md! md:max-w-lg!"
      >
        {category ? (
          <Body
            category={category}
            data={data}
            allCategories={allCategories ?? []}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  category,
  data,
  allCategories,
}: {
  category: Category;
  data: CategoryWithData | null;
  allCategories: Category[];
}) {
  const sameKind = allCategories.filter(
    (c) => c.kind === category.kind && c.id !== category.id
  );
  const eligibleParents = sameKind
    .filter((c) => c.parentId == null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader
        className="gap-3 border-b border-border/40 p-6"
        style={{
          background: tint(category.color, 0.15),
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/70"
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: category.color }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle>{category.name}</SheetTitle>
            <SheetDescription className="mt-0.5">
              {category.kind === "expense" ? "Expense" : "Income"} category
              {data?.parentName ? ` · in ${data.parentName}` : ""}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 p-6">
        {!category.parentId && data?.isParent !== true ? (
          <BudgetSection category={category} data={data} />
        ) : (
          <BudgetSection category={category} data={data} />
        )}

        <GroupSection
          category={category}
          eligibleParents={eligibleParents}
        />

        <DescriptionSection category={category} />
      </div>
    </div>
  );
}

function BudgetSection({
  category,
  data,
}: {
  category: Category;
  data: CategoryWithData | null;
}) {
  const queryClient = useQueryClient();
  const isBudgeted = category.budgetMode === "budgeted";

  const modeMutation = useMutation({
    mutationFn: (next: "budgeted" | "tracking") =>
      updateCategoryBudgetMode(category.id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const budgetMutation = useMutation({
    mutationFn: (amount: number | null) => updateBudget(category.id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const [amount, setAmount] = useState(
    data ? String(Math.round(data.budget)) : ""
  );

  useEffect(() => {
    if (data) setAmount(String(Math.round(data.budget)));
  }, [data]);

  const handleBlur = () => {
    if (!data) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (Math.round(parsed) === Math.round(data.budget)) return;
    budgetMutation.mutate(parsed);
  };

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Budget
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Label
              htmlFor={`mode-${category.id}`}
              className="text-sm font-medium"
            >
              {isBudgeted ? "Budgeted" : "Tracking only"}
            </Label>
            <p className="text-xs text-muted-foreground">
              {isBudgeted
                ? "Show progress vs a monthly target."
                : "Show spending without a target."}
            </p>
          </div>
          <Switch
            id={`mode-${category.id}`}
            checked={isBudgeted}
            onCheckedChange={(next) =>
              modeMutation.mutate(next ? "budgeted" : "tracking")
            }
          />
        </div>

        {isBudgeted ? (
          <div className="mt-4 space-y-1.5">
            <Label htmlFor={`budget-${category.id}`}>Monthly budget</Label>
            <InputGroup prefix="₪">
              <Input
                id={`budget-${category.id}`}
                type="number"
                className="text-right tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={handleBlur}
                min={0}
              />
            </InputGroup>
            {data ? (
              <p className="text-[11px] text-muted-foreground">
                Spent ₪{Math.round(data.spent).toLocaleString("en-IL")} this
                month
                {data.vsTypical && data.vsTypical.typical > 0 ? (
                  <>
                    {" "}
                    · typical ≈ ₪
                    {Math.round(data.vsTypical.typical).toLocaleString(
                      "en-IL"
                    )}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function GroupSection({
  category,
  eligibleParents,
}: {
  category: Category;
  eligibleParents: Category[];
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (parentId: number | null) =>
      setCategoryParent(category.id, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success("Group updated");
    },
    onError: (err: Error) => {
      const reason = err.message;
      if (reason === "kind-mismatch") {
        toast.error("Parent must be the same kind (expense or income).");
      } else if (reason === "not-leaf-target") {
        toast.error("Parent must be a top-level category.");
      } else if (reason === "child-has-children") {
        toast.error(
          "Can't move a category that already has sub-categories under it."
        );
      } else {
        toast.error("Couldn't update parent.");
      }
    },
  });
  const current =
    category.parentId == null ? NONE_VALUE : String(category.parentId);

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Group
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-2">
        <Label>Parent group</Label>
        <Select
          value={current}
          onValueChange={(v) => {
            if (!v) return;
            const next = v === NONE_VALUE ? null : Number(v);
            mutation.mutate(next);
          }}
        >
          <SelectTrigger>
            <SelectValue>
              {(value: string) =>
                value === NONE_VALUE
                  ? "(no parent)"
                  : eligibleParents.find((p) => String(p.id) === value)?.name ??
                    "(no parent)"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>(no parent)</SelectItem>
            {eligibleParents.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Use a parent group to roll spending up. Most users keep the defaults.
        </p>
      </div>
    </section>
  );
}

function DescriptionSection({ category }: { category: Category }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(category.description ?? "");
  useEffect(() => {
    setValue(category.description ?? "");
  }, [category.description]);

  const mutation = useMutation({
    mutationFn: (next: string | null) =>
      updateCategoryDescription(category.id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Description saved");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Couldn't save description");
    },
  });

  const handleBlur = () => {
    const trimmed = value.trim();
    const current = (category.description ?? "").trim();
    if (trimmed === current) return;
    if (trimmed.length > DESCRIPTION_MAX) {
      toast.error(
        `Description must be ${DESCRIPTION_MAX} characters or fewer.`
      );
      return;
    }
    mutation.mutate(trimmed.length === 0 ? null : trimmed);
  };

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        AI hint
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-2">
        <Label htmlFor={`desc-${category.id}`}>Description</Label>
        <textarea
          id={`desc-${category.id}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          rows={4}
          maxLength={DESCRIPTION_MAX}
          placeholder={`Describe what belongs in "${category.name}" — and what does NOT.`}
          className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={mutation.isPending}
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Sent to the AI on every categorize.</span>
          <span className="tabular-nums">
            {value.length} / {DESCRIPTION_MAX}
          </span>
        </div>
      </div>
    </section>
  );
}

function tint(color: string, alpha: number): string {
  return `color-mix(in oklch, ${color} ${Math.round(alpha * 100)}%, var(--card))`;
}
