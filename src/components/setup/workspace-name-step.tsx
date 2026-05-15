"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface WorkspaceNameStepProps {
  onComplete: (name: string) => void;
  submitting?: boolean;
}

const SUGGESTIONS = ["Personal", "Business", "Joint", "Side hustle"];

export function WorkspaceNameStep({
  onComplete,
  submitting = false,
}: WorkspaceNameStepProps) {
  const [name, setName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onComplete(trimmed);
  }

  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 pt-8 text-center">
      <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        Step One · Workspace
      </div>
      <h1 className="max-w-[440px] font-serif text-4xl leading-[1.08] tracking-tight">
        What should we call this corner of your finances?
      </h1>
      <p className="max-w-[380px] text-sm leading-relaxed text-muted-foreground">
        A workspace keeps one slice of your life isolated — its own banks,
        categories, budgets. Most people start with{" "}
        <span className="text-foreground underline decoration-primary underline-offset-2">
          Personal
        </span>
        .
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-2 flex w-full max-w-[380px] flex-col items-center gap-3"
      >
        <div className="relative w-full rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
          <div className="absolute right-5 top-5 text-[9px] font-semibold text-muted-foreground">
            {name.length}/60
          </div>
          <label
            htmlFor="workspace-name"
            className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
          >
            Workspace name
          </label>
          <input
            id="workspace-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
            disabled={submitting}
            placeholder="Personal"
            className="mt-2 w-full border-0 bg-transparent p-0 font-serif text-2xl leading-tight tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40"
          />
        </div>

        <div className="flex flex-wrap justify-center gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setName(s)}
              disabled={submitting}
              className="rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          You can rename it later from Settings.
        </p>

        <Button
          type="submit"
          disabled={!name.trim() || submitting}
          className="rounded-full px-6 py-3 text-sm font-semibold"
        >
          {submitting ? "Creating…" : "Create & continue →"}
        </Button>
      </form>

      <div className="mt-6 flex w-full max-w-[380px] items-center justify-between text-[10px] text-muted-foreground/80">
        <span>Encrypted locally</span>
        <span>
          Press{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] font-semibold">
            ↵
          </kbd>{" "}
          to continue
        </span>
      </div>
    </div>
  );
}
