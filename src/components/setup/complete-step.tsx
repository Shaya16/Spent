"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { listIntegrations, getSettings } from "@/lib/api";
import { BANK_PROVIDERS } from "@/lib/types";
import { ProviderBadge } from "./provider-badge";

interface CompleteStepProps {
  onFinish: () => void;
}

type StepState = "todo" | "active" | "done";

interface ImportStep {
  id: string;
  label: string;
  state: StepState;
}

export function CompleteStep({ onFinish }: CompleteStepProps) {
  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: listIntegrations,
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const aiLabel =
    settings?.aiProvider === "claude"
      ? "Claude (Anthropic)"
      : settings?.aiProvider === "ollama"
        ? `Ollama · ${settings?.ollamaModel ?? "local"}`
        : "Manual categorization";

  return (
    <div className="mx-auto max-w-2xl space-y-7 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: "spring",
          damping: 14,
          stiffness: 160,
          delay: 0.05,
        }}
        className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary/15"
      >
        <svg width="44" height="44" viewBox="0 0 36 36">
          <circle cx="18" cy="22" r="12" fill="var(--primary)" />
          <circle cx="18" cy="11" r="5.5" fill="var(--status-heads-up)" />
          <circle cx="26" cy="16" r="4" fill="var(--status-plenty-left)" />
        </svg>
      </motion.div>

      <div>
        <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Step 3 of 3 · Done
        </div>
        <motion.h1
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mt-2 font-serif text-4xl leading-tight"
        >
          You&apos;re all set 🌱
        </motion.h1>
        <motion.p
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.22 }}
          className="mx-auto mt-2 max-w-md text-sm text-muted-foreground"
        >
          When you click below, Spent will pull your transactions and bucket
          them up. You can re-sync any time from the dashboard or settings.
        </motion.p>
      </div>

      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl bg-card p-5 text-left"
      >
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Setup summary
        </div>

        <div className="border-t border-border/40 py-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            🏦 Connections · {integrations.length}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {integrations.map((integ) => {
              const info = BANK_PROVIDERS.find((b) => b.id === integ.provider);
              if (!info) return null;
              return (
                <span
                  key={integ.provider}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2.5 text-xs"
                >
                  <ProviderBadge
                    color={info.color}
                    name={info.name}
                    domain={info.domain}
                    size={20}
                    radius={6}
                  />
                  <span className="font-medium">{info.name}</span>
                </span>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-[100px_1fr] items-center gap-3 border-t border-border/40 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            🤖 AI
          </span>
          <span className="text-sm font-medium">{aiLabel}</span>
        </div>

        <div className="grid grid-cols-[100px_1fr] items-center gap-3 border-t border-border/40 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            🔒 Storage
          </span>
          <span className="text-sm font-medium">
            Local · <code className="text-xs">data/spent.db</code>
          </span>
        </div>
      </motion.div>

      <ImportProgress />

      <div className="flex justify-center">
        <Button size="lg" onClick={onFinish}>
          Open my budgets →
        </Button>
      </div>
    </div>
  );
}

function ImportProgress() {
  const [steps, setSteps] = useState<ImportStep[]>([
    { id: "connect", label: "Connecting to providers", state: "active" },
    { id: "fetch", label: "Ready to fetch 90 days of activity", state: "todo" },
    { id: "cat", label: "Ready to categorize transactions", state: "todo" },
    { id: "budgets", label: "Ready to suggest initial budgets", state: "todo" },
  ]);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      setSteps((prev) =>
        prev.map((s, idx) => {
          if (idx < i) return { ...s, state: "done" };
          if (idx === i) return { ...s, state: "active" };
          return { ...s, state: "todo" };
        })
      );
      if (i >= 4) clearInterval(id);
    }, 850);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="rounded-2xl bg-card p-4 text-left"
    >
      {steps.map((s, i) => (
        <div
          key={s.id}
          className={`flex items-center gap-3 py-2 ${
            i > 0 ? "border-t border-border/40" : ""
          }`}
        >
          <motion.div
            animate={
              s.state === "active"
                ? { scale: [1, 1.06, 1] }
                : { scale: 1 }
            }
            transition={
              s.state === "active"
                ? { duration: 1.2, repeat: Infinity }
                : { duration: 0.2 }
            }
            className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
            style={{
              background:
                s.state === "done"
                  ? "var(--primary)"
                  : s.state === "active"
                    ? "rgba(232, 175, 90, 0.35)"
                    : "var(--muted)",
              color: s.state === "done" ? "#fff" : "#7a5a12",
            }}
          >
            <AnimatePresence mode="wait">
              {s.state === "done" && (
                <motion.span
                  key="done"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  ✓
                </motion.span>
              )}
              {s.state === "active" && (
                <motion.span
                  key="active"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                >
                  ⟳
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
          <span
            className={`text-sm ${
              s.state === "todo"
                ? "text-muted-foreground"
                : s.state === "active"
                  ? "font-medium"
                  : ""
            }`}
          >
            {s.label}
          </span>
          {s.state === "active" && (
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              working...
            </span>
          )}
        </div>
      ))}
    </motion.div>
  );
}
