"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { BankStep } from "@/components/setup/bank-step";
import { AIStep } from "@/components/setup/ai-step";
import { MonthlyTargetStep } from "@/components/setup/monthly-target-step";
import { BudgetsStep } from "@/components/setup/budgets-step";
import { CompleteStep } from "@/components/setup/complete-step";
import { WorkspaceNameStep } from "@/components/setup/workspace-name-step";
import { createWorkspace } from "@/lib/api";
import { setActiveWorkspaceId } from "@/lib/workspace-store";
import { useQueryClient } from "@tanstack/react-query";

export type SetupMode = "first-run" | "new-workspace";

type WizardStep = 0 | 1 | 2 | 3 | 4 | 5;

const FIRST_RUN_STEPS = [
  { n: 1 as const, label: "Connect" },
  { n: 2 as const, label: "AI" },
  { n: 5 as const, label: "Target" },
  { n: 3 as const, label: "Budgets" },
  { n: 4 as const, label: "Done" },
];

const NEW_WORKSPACE_STEPS = [
  { n: 0 as const, label: "Name" },
  { n: 1 as const, label: "Connect" },
  { n: 5 as const, label: "Target" },
  { n: 3 as const, label: "Budgets" },
  { n: 4 as const, label: "Done" },
];

export function SetupWizard({ mode = "first-run" }: { mode?: SetupMode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>(
    mode === "new-workspace" ? 0 : 1
  );
  const [creating, setCreating] = useState(false);

  const steps =
    mode === "new-workspace" ? NEW_WORKSPACE_STEPS : FIRST_RUN_STEPS;

  async function handleNameSubmit(name: string) {
    setCreating(true);
    try {
      const ws = await createWorkspace(name);
      setActiveWorkspaceId(ws.id);
      queryClient.invalidateQueries();
      setStep(1);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create workspace"
      );
    } finally {
      setCreating(false);
    }
  }

  function handleFinish() {
    queryClient.invalidateQueries();
    router.push("/");
  }

  return (
    <div className="relative min-h-screen bg-background">
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-6 md:px-8">
        <BrandMark />
        <DotStepper step={step} steps={steps} />
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="hidden text-xs text-muted-foreground hover:text-foreground md:inline"
        >
          Docs ↗
        </a>
      </header>

      <main className="relative z-10 mx-auto px-6 pb-16 md:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
          >
            {step === 0 && (
              <WorkspaceNameStep
                onComplete={handleNameSubmit}
                submitting={creating}
              />
            )}
            {step === 1 && (
              <BankStep
                onComplete={() =>
                  setStep(mode === "new-workspace" ? 5 : 2)
                }
              />
            )}
            {step === 2 && (
              <AIStep
                onComplete={() => setStep(5)}
                onBack={() => setStep(1)}
              />
            )}
            {step === 5 && (
              <MonthlyTargetStep
                onComplete={() => setStep(3)}
                onBack={() =>
                  setStep(mode === "new-workspace" ? 1 : 2)
                }
              />
            )}
            {step === 3 && (
              <BudgetsStep
                onComplete={() => setStep(4)}
                onBack={() => setStep(5)}
              />
            )}
            {step === 4 && <CompleteStep onFinish={handleFinish} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/logo_lightmode.svg"
        alt="Spent"
        className="h-8 w-auto dark:hidden"
      />
      <img
        src="/logo_darkmode.svg"
        alt="Spent"
        className="hidden h-8 w-auto dark:block"
      />
      <div>
        <div className="font-serif text-lg font-semibold leading-none tracking-tight">
          Spent
        </div>
        <div className="mt-1 text-[8px] font-bold tracking-[0.18em] text-muted-foreground">
          YOUR MONEY · OPEN SOURCE
        </div>
      </div>
    </div>
  );
}

interface StepDef {
  n: WizardStep;
  label: string;
}

function DotStepper({
  step,
  steps,
}: {
  step: WizardStep;
  steps: ReadonlyArray<StepDef>;
}) {
  const currentIdx = steps.findIndex((s) => s.n === step);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const state =
          i < currentIdx ? "done" : i === currentIdx ? "active" : "todo";
        return (
          <div key={s.n} className="flex items-center gap-2">
            <DotLabel label={s.label} state={state} />
            {i < steps.length - 1 && (
              <motion.div
                animate={{
                  background:
                    i < currentIdx
                      ? "var(--primary)"
                      : "var(--border)",
                }}
                transition={{ duration: 0.35 }}
                className="h-px w-3.5 rounded-full"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DotLabel({
  label,
  state,
}: {
  label: string;
  state: "todo" | "active" | "done";
}) {
  return (
    <div className="flex items-center gap-1.5">
      <motion.div
        animate={{
          background:
            state === "active"
              ? "var(--foreground)"
              : state === "done"
                ? "var(--primary)"
                : "var(--border)",
          scale: state === "active" ? 1.4 : 1,
        }}
        transition={{ duration: 0.25 }}
        className="h-1.5 w-1.5 rounded-full"
      />
      <span
        className={`text-[9px] font-bold uppercase tracking-[0.14em] transition-colors ${
          state === "active"
            ? "text-foreground"
            : state === "done"
              ? "text-primary"
              : "text-muted-foreground/60"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
