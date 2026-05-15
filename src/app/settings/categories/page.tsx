"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionShell } from "@/components/settings/section-shell";
import { CategoryDetailSheet } from "@/components/settings/category-detail-sheet";
import { getMonthRange } from "@/lib/formatters";
import {
  createCategory,
  getCategories,
  getSummary,
} from "@/lib/api";
import type { Category, CategoryKind, CategoryWithData } from "@/lib/types";

export default function CategoriesSettingsPage() {
  const { from, to } = getMonthRange();
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });
  const { data: summary } = useQuery({
    queryKey: ["summary", from, to],
    queryFn: () => getSummary({ from, to }),
  });

  const [search, setSearch] = useState("");
  const [activeKind, setActiveKind] = useState<CategoryKind>("expense");
  const [openId, setOpenId] = useState<number | null>(null);

  const dataByCategoryId = useMemo(() => {
    const m = new Map<number, CategoryWithData>();
    summary?.categoriesWithData.forEach((c) => m.set(c.categoryId, c));
    return m;
  }, [summary]);

  const filtered = useMemo(() => {
    if (!categories) return [];
    return categories
      .filter((c) => c.kind === activeKind)
      .filter((c) =>
        search.trim().length === 0
          ? true
          : c.name.toLowerCase().includes(search.toLowerCase())
      );
  }, [categories, activeKind, search]);

  const { parents, childrenByParent, orphans } = useMemo(() => {
    const parentIds = new Set<number>();
    filtered.forEach((c) => {
      if (c.parentId != null) parentIds.add(c.parentId);
    });
    const parents = filtered
      .filter((c) => c.parentId == null && parentIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    const childrenByParent = new Map<number, Category[]>();
    filtered.forEach((c) => {
      if (c.parentId != null) {
        const list = childrenByParent.get(c.parentId) ?? [];
        list.push(c);
        childrenByParent.set(c.parentId, list);
      }
    });
    childrenByParent.forEach((list) =>
      list.sort((a, b) => a.name.localeCompare(b.name))
    );
    const orphans = filtered
      .filter((c) => c.parentId == null && !parentIds.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { parents, childrenByParent, orphans };
  }, [filtered]);

  return (
    <>
      <SectionShell
        title="Categories"
        description="One place to set budgets, descriptions, and grouping. Click any category to edit it."
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-border bg-card p-0.5">
            <KindTab
              active={activeKind === "expense"}
              onClick={() => setActiveKind("expense")}
            >
              Expense
            </KindTab>
            <KindTab
              active={activeKind === "income"}
              onClick={() => setActiveKind("income")}
            >
              Income
            </KindTab>
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories…"
              className="pl-8"
            />
          </div>
          <NewGroupDialog kind={activeKind} />
        </div>

        {!categories ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No matching categories.
          </div>
        ) : (
          <div className="space-y-6">
            {parents.map((parent) => (
              <GroupBlock
                key={parent.id}
                title={parent.name}
                color={parent.color}
                parent={parent}
                onSelect={setOpenId}
                dataById={dataByCategoryId}
              >
                {childrenByParent.get(parent.id)?.map((child) => (
                  <CategoryRow
                    key={child.id}
                    category={child}
                    data={dataByCategoryId.get(child.id) ?? null}
                    onSelect={() => setOpenId(child.id)}
                  />
                ))}
              </GroupBlock>
            ))}
            {orphans.length > 0 ? (
              <GroupBlock
                title="Ungrouped"
                color="#9ca3af"
                onSelect={setOpenId}
                dataById={dataByCategoryId}
              >
                {orphans.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    data={dataByCategoryId.get(cat.id) ?? null}
                    onSelect={() => setOpenId(cat.id)}
                  />
                ))}
              </GroupBlock>
            ) : null}
          </div>
        )}
      </SectionShell>

      <CategoryDetailSheet
        categoryId={openId}
        data={openId != null ? (dataByCategoryId.get(openId) ?? null) : null}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function KindTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function GroupBlock({
  title,
  color,
  parent,
  children,
  onSelect,
}: {
  title: string;
  color: string;
  parent?: Category;
  dataById: Map<number, CategoryWithData>;
  children: React.ReactNode;
  onSelect: (id: number) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: color }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </span>
        {parent ? (
          <button
            type="button"
            onClick={() => onSelect(parent.id)}
            className="ml-auto text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 hover:text-foreground"
          >
            Edit group
          </button>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <ul className="divide-y divide-border/60">{children}</ul>
      </div>
    </section>
  );
}

function CategoryRow({
  category,
  data,
  onSelect,
}: {
  category: Category;
  data: CategoryWithData | null;
  onSelect: () => void;
}) {
  const description = category.description?.trim();
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: category.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{category.name}</span>
          </div>
          {description ? (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          {data ? (
            <div className="text-xs tabular-nums text-muted-foreground">
              ₪{Math.round(data.spent).toLocaleString("en-IL")} spent
            </div>
          ) : null}
        </div>
        <BudgetChip category={category} data={data} />
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      </button>
    </li>
  );
}

function BudgetChip({
  category,
  data,
}: {
  category: Category;
  data: CategoryWithData | null;
}) {
  if (category.budgetMode === "tracking") {
    return (
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        tracking
      </span>
    );
  }
  if (!data || data.budget <= 0) {
    return (
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        no budget
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-foreground/8 px-2 py-0.5 text-[11px] font-medium tabular-nums">
      ₪{Math.round(data.budget).toLocaleString("en-IL")}
    </span>
  );
}

function NewGroupDialog({ kind }: { kind: CategoryKind }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [k, setK] = useState<CategoryKind>(kind);

  const mutation = useMutation({
    mutationFn: () =>
      createCategory({
        name: name.trim(),
        kind: k,
        isParent: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success(`Created "${name.trim()}"`);
      setName("");
      setOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Couldn't create group");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setK(kind);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New group
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New parent group</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-group-name">Name</Label>
            <Input
              id="new-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Food, Transport, Lifestyle"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim().length > 0) {
                  mutation.mutate();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select
              value={k}
              onValueChange={(v) => v && setK(v as CategoryKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="income">Income</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={name.trim().length === 0 || mutation.isPending}
          >
            {mutation.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
