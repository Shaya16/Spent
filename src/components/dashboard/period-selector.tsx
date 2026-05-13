"use client";

import { Button } from "@/components/ui/button";

interface PeriodSelectorProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}

export function PeriodSelector({ label, onPrev, onNext }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrev}>
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </Button>
      <span className="min-w-[140px] text-center text-sm font-medium">
        {label}
      </span>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext}>
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>
      </Button>
    </div>
  );
}
