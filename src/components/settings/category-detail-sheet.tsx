"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, InputGroup } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { Locale } from "@/i18n/routing";
import {
  deleteCategory,
  getCategories,
  setCategoryParent,
  updateBudget,
  updateCategoryBudgetMode,
  updateCategoryDescription,
} from "@/lib/api";
import { tint } from "@/lib/colors";
import { formatCurrency } from "@/lib/formatters";
import type { Category, CategoryWithData } from "@/lib/types";

const NONE_VALUE = "__none__";
const DESCRIPTION_MAX = 500;

export interface CategoryDetailSheetProps {
  categoryId: number | null;
  data: CategoryWithData | null;
  onClose: () => void;
}

export function CategoryDetailSheet({ categoryId, data, onClose }: CategoryDetailSheetProps) {
  const open = categoryId !== null;
  const { data: allCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
    enabled: open,
  });
  const category = useMemo(
    () => allCategories?.find((c) => c.id === categoryId) ?? null,
    [allCategories, categoryId],
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="w-full p-0 sm:max-w-md! md:max-w-lg!">
        {category ? (
          <Body
            category={category}
            data={data}
            allCategories={allCategories ?? []}
            onClose={onClose}
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
  onClose,
}: {
  category: Category;
  data: CategoryWithData | null;
  allCategories: Category[];
  onClose: () => void;
}) {
  const t = useTranslations("settings.categories");
  const sameKind = allCategories.filter((c) => c.kind === category.kind && c.id !== category.id);
  const eligibleParents = sameKind
    .filter((c) => c.parentId == null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const childCategories = useMemo(
    () =>
      allCategories
        .filter((c) => c.parentId === category.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allCategories, category.id],
  );
  const isParentGroup = childCategories.length > 0 || data?.isParent === true;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader
        className="gap-3 border-b border-border/40 p-6"
        style={{
          background: tint(category.color, 0.15),
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/70">
            <span className="h-3 w-3 rounded-full" style={{ background: category.color }} />
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle>{category.name}</SheetTitle>
            <SheetDescription className="mt-0.5">
              {category.kind === "expense" ? t("kindExpenseCategory") : t("kindIncomeCategory")}
              {data?.parentName ? t("inParentSuffix", { parent: data.parentName }) : ""}
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

        <GroupSection category={category} eligibleParents={eligibleParents} />

        <DescriptionSection category={category} />

        <DeleteCategorySection
          category={category}
          transactionCount={data?.transactionCount ?? 0}
          isParentGroup={isParentGroup}
          childCategories={childCategories}
          onDeleted={onClose}
        />
      </div>
    </div>
  );
}

function parseDeleteCategoryError(message: string): string[] | null {
  try {
    const body = JSON.parse(message) as {
      error?: string;
      children?: { name: string }[];
    };
    if (body.error === "has-children" && body.children?.length) {
      return body.children.map((c) => c.name);
    }
  } catch {
    /* not JSON */
  }
  return null;
}

function DeleteCategorySection({
  category,
  transactionCount,
  isParentGroup,
  childCategories,
  onDeleted,
}: {
  category: Category;
  transactionCount: number;
  isParentGroup: boolean;
  childCategories: Category[];
  onDeleted: () => void;
}) {
  const t = useTranslations("settings.categories");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => deleteCategory(category.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(t("deletedToast", { count: result.unassignedTransactionCount }));
      setOpen(false);
      onDeleted();
    },
    onError: (err: Error) => {
      const names =
        parseDeleteCategoryError(err.message) ??
        (childCategories.length > 0 ? childCategories.map((c) => c.name) : null);
      if (names && names.length > 0) {
        toast.error(t("deleteHasChildrenNamed", { names: names.join(", ") }));
      } else if (err.message.includes("has-children") || err.message.includes("409")) {
        toast.error(t("deleteHasChildren"));
      } else {
        toast.error(t("deleteFailed"));
      }
    },
  });

  return (
    <>
      <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t("deleteTitle")}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isParentGroup ? t("deleteParentHint") : t("deleteHint")}
            </p>
            {isParentGroup && childCategories.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 ps-4 text-xs text-foreground/80">
                {childCategories.map((child) => (
                  <li key={child.id}>{child.name}</li>
                ))}
              </ul>
            ) : null}
            <Button
              variant="destructive"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => setOpen(true)}
              disabled={isParentGroup}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("deleteButton")}
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmDeleteTitle", { name: category.name })}</DialogTitle>
            <DialogDescription>
              {t("confirmDeleteDescription", { count: transactionCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? tCommon("deleting") : t("deleteButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BudgetSection({ category, data }: { category: Category; data: CategoryWithData | null }) {
  const t = useTranslations("settings.categories");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const isBudgeted = category.budgetMode === "budgeted";

  const modeMutation = useMutation({
    mutationFn: (next: "budgeted" | "tracking") => updateCategoryBudgetMode(category.id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: () => {
      toast.error(tc("saveFailed"));
    },
  });

  const budgetMutation = useMutation({
    mutationFn: (amount: number | null) => updateBudget(category.id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: () => {
      toast.error(tc("saveFailed"));
    },
  });

  const [amount, setAmount] = useState(data ? String(Math.round(data.budget)) : "");

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
        {t("budgetSectionLabel")}
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={`mode-${category.id}`} className="text-sm font-medium">
              {isBudgeted ? t("budgeted") : t("trackingOnly")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {isBudgeted ? t("budgetedHint") : t("trackingOnlyHint")}
            </p>
          </div>
          <Switch
            id={`mode-${category.id}`}
            checked={isBudgeted}
            onCheckedChange={(next) => modeMutation.mutate(next ? "budgeted" : "tracking")}
          />
        </div>

        {isBudgeted ? (
          <div className="mt-4 space-y-1.5">
            <Label htmlFor={`budget-${category.id}`}>{t("monthlyBudget")}</Label>
            <InputGroup prefix="₪">
              <Input
                id={`budget-${category.id}`}
                type="number"
                className="text-end tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={handleBlur}
                min={0}
              />
            </InputGroup>
            {data ? (
              <p className="text-[11px] text-muted-foreground">
                {t("spentThisMonth", {
                  amount: formatCurrency(Math.round(data.spent), "ILS", locale),
                })}
                {data.vsTypical && data.vsTypical.typical > 0
                  ? t("typicalSuffix", {
                      amount: formatCurrency(Math.round(data.vsTypical.typical), "ILS", locale),
                    })
                  : null}
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
  const t = useTranslations("settings.categories");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (parentId: number | null) => setCategoryParent(category.id, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success(t("groupUpdated"));
    },
    onError: (err: Error) => {
      const reason = err.message;
      if (reason === "kind-mismatch") {
        toast.error(t("parentKindMismatch"));
      } else if (reason === "not-leaf-target") {
        toast.error(t("parentMustBeTopLevel"));
      } else if (reason === "child-has-children") {
        toast.error(t("childHasChildren"));
      } else {
        toast.error(t("parentUpdateFailed"));
      }
    },
  });
  const current = category.parentId == null ? NONE_VALUE : String(category.parentId);

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t("groupSectionLabel")}
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-2">
        <Label>{t("parentGroup")}</Label>
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
                  ? t("noParent")
                  : (eligibleParents.find((p) => String(p.id) === value)?.name ?? t("noParent"))
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>{t("noParent")}</SelectItem>
            {eligibleParents.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">{t("parentGroupHint")}</p>
      </div>
    </section>
  );
}

function DescriptionSection({ category }: { category: Category }) {
  const t = useTranslations("settings.categories");
  const queryClient = useQueryClient();
  const [value, setValue] = useState(category.description ?? "");
  useEffect(() => {
    setValue(category.description ?? "");
  }, [category.description]);

  const mutation = useMutation({
    mutationFn: (next: string | null) => updateCategoryDescription(category.id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(t("descriptionSaved"));
    },
    onError: (err: Error) => {
      toast.error(err.message || t("descriptionSaveFailed"));
    },
  });

  const handleBlur = () => {
    const trimmed = value.trim();
    const current = (category.description ?? "").trim();
    if (trimmed === current) return;
    if (trimmed.length > DESCRIPTION_MAX) {
      toast.error(t("descriptionTooLong", { max: DESCRIPTION_MAX }));
      return;
    }
    mutation.mutate(trimmed.length === 0 ? null : trimmed);
  };

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t("aiHintSectionLabel")}
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-2">
        <Label htmlFor={`desc-${category.id}`}>{t("descriptionLabel")}</Label>
        <textarea
          id={`desc-${category.id}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          rows={4}
          maxLength={DESCRIPTION_MAX}
          placeholder={t("descriptionPlaceholder", { name: category.name })}
          className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={mutation.isPending}
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{t("aiHintFooter")}</span>
          <span className="tabular-nums">
            {value.length} / {DESCRIPTION_MAX}
          </span>
        </div>
      </div>
    </section>
  );
}
