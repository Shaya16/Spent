"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PeriodSelectorProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
  nextDisabled?: boolean;
}

export function PeriodSelector({
  label,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  nextDisabled = false,
}: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-input bg-background px-1">
      <Button variant="ghost" size="icon-sm" onClick={onPrev} aria-label={prevLabel}>
        <ChevronLeft className="rtl:rotate-180" aria-hidden />
      </Button>
      <span className="min-w-[120px] text-center text-sm font-medium tabular-nums">{label}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={nextLabel}
      >
        <ChevronRight className="rtl:rotate-180" aria-hidden />
      </Button>
    </div>
  );
}
