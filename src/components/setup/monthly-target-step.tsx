"use client";

import { useState } from "react";
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
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Step 3 of 5
        </div>
        <h1 className="font-serif text-4xl leading-tight">
          What's a fair monthly spending target?
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          This single number drives the pace verdict on your dashboard. It's
          your overall ceiling for the month — per-category budgets come in the
          next step.
        </p>
      </header>

      <div className="max-w-sm space-y-2">
        <label
          htmlFor="monthly-target"
          className="text-xs font-medium text-foreground/80"
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
          Not sure yet? You can skip this and set it later in settings.
        </p>
      </div>

      <footer className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          ← Back
        </Button>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => save(null)}
            disabled={saving}
          >
            Skip
          </Button>
          <Button
            onClick={() => save(valid ? parsed : null)}
            disabled={saving || !valid}
          >
            {saving ? "Saving..." : "Continue →"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
