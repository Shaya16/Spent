"use client";

import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface TransactionMultiFilterProps {
  label: string;
  icon: LucideIcon;
  displayValue: string;
  triggerClassName?: string;
  selectAllLabel: string;
  clearLabel: string;
  onSelectAll: () => void;
  onClear: () => void;
  showBulkActions?: boolean;
  children: React.ReactNode;
}

export function TransactionMultiFilter({
  label,
  icon: Icon,
  displayValue,
  triggerClassName,
  selectAllLabel,
  clearLabel,
  onSelectAll,
  onClear,
  showBulkActions = true,
  children,
}: TransactionMultiFilterProps) {
  const triggerTitle = `${label}: ${displayValue}`;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex h-8 min-w-[160px] max-w-[220px] items-center justify-between gap-1 rounded-lg border border-input bg-transparent py-2 pe-2 ps-2.5 text-sm transition-colors outline-none select-none hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
          triggerClassName,
        )}
        title={triggerTitle}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-muted-foreground">: </span>
            <span className="font-medium text-foreground">{displayValue}</span>
          </span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        {showBulkActions ? (
          <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onSelectAll}
            >
              {selectAllLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={onClear}
            >
              {clearLabel}
            </Button>
          </div>
        ) : null}
        <div className="max-h-64 overflow-y-auto p-1">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

interface MultiFilterOptionProps {
  selected: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}

export function MultiFilterOption({
  selected,
  onToggle,
  children,
  className,
}: MultiFilterOptionProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors hover:bg-accent",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input",
          selected && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {selected ? <Check className="h-3 w-3" /> : null}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}
