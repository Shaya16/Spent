"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, InputGroup } from "@/components/ui/input";
import { updateSettings } from "@/lib/api";

interface MonthlyTargetStepProps {
  onComplete: () => void;
  onBack: () => void;
}

export function MonthlyTargetStep({ onComplete, onBack }: MonthlyTargetStepProps) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = value.trim() === "" ? null : Number(value);
  const valid = parsed == null || (Number.isFinite(parsed) && parsed >= 0);

  async function save(target: number | null) {
    setSaving(true);
    try {
      await updateSettings({ monthlyTarget: target });
      onComplete();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-6">
      <header className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Step 3 of 5
        </div>
        <h1 className="font-serif text-4xl leading-[1.08] tracking-tight">
          Set your monthly ceiling
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A single number for how much you want to spend each month.
        </p>
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-card/60 p-3">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
          <Info className="h-3 w-3" />
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Your dashboard will show a <strong className="text-foreground">pace meter</strong>:
          green when you&apos;re tracking under, amber as you near the limit, red if you go over.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="monthly-target"
          className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground"
        >
          Monthly target
        </label>
        <InputGroup prefix="₪">
          <Input
            id="monthly-target"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder="e.g. 10000"
            className="text-right tabular-nums"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </InputGroup>
        <p className="text-[11px] text-muted-foreground">
          You can change this any time in settings.
        </p>
      </div>

      <footer className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          ← Back
        </Button>
        <Button
          onClick={() => save(valid ? parsed : null)}
          disabled={saving || !valid}
        >
          {saving ? "Saving..." : "Continue →"}
        </Button>
      </footer>

      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={() => save(null)}
          disabled={saving}
          className="text-[11px] text-muted-foreground underline decoration-muted-foreground/30 underline-offset-4 transition-colors hover:text-foreground"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
