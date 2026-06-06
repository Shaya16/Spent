"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import type { SortOrder, TransactionSortField } from "@/lib/transaction-sort";
import { cn } from "@/lib/utils";

interface SortableTableHeadProps {
  label: string;
  field: TransactionSortField;
  activeField: TransactionSortField;
  activeOrder: SortOrder;
  onSort: (field: TransactionSortField) => void;
  className?: string;
  align?: "start" | "end";
  sortAscLabel: string;
  sortDescLabel: string;
}

export function SortableTableHead({
  label,
  field,
  activeField,
  activeOrder,
  onSort,
  className,
  align = "start",
  sortAscLabel,
  sortDescLabel,
}: SortableTableHeadProps) {
  const active = activeField === field;
  const ariaSort = active ? (activeOrder === "asc" ? "ascending" : "descending") : "none";

  return (
    <TableHead className={cn(align === "end" && "text-end", className)} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
          align === "end" && "ms-auto",
          active && "text-foreground",
        )}
        title={active ? (activeOrder === "asc" ? sortAscLabel : sortDescLabel) : label}
      >
        <span>{label}</span>
        {active ? (
          activeOrder === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 opacity-70" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-35" />
        )}
      </button>
    </TableHead>
  );
}
