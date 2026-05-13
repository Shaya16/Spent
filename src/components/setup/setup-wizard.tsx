"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BankStep } from "@/components/setup/bank-step";
import { AIStep } from "@/components/setup/ai-step";
import { CompleteStep } from "@/components/setup/complete-step";

type StepIndex = 1 | 2 | 3;

const STEPS = [
  { n: 1 as const, label: "Connect" },
  { n: 2 as const, label: "AI" },
  { n: 3 as const, label: "Done" },
];

export function SetupWizard() {
  const [step, setStep] = useState<StepIndex>(1);
  const router = useRouter();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Soft pastel blobs */}
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div
          className="absolute -left-40 -top-32 h-[600px] w-[600px] rounded-full opacity-50 blur-3xl"
          style={{ background: "var(--primary)" }}
        />
        <div
          className="absolute -right-40 -bottom-32 h-[520px] w-[520px] rounded-full opacity-40 blur-3xl"
          style={{ background: "var(--status-heads-up)" }}
        />
      </div>

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6 md:px-8">
        <div className="flex items-center gap-2.5">
          <svg width="34" height="34" viewBox="0 0 34 34">
            <circle cx="17" cy="22" r="10.5" fill="var(--primary)" />
            <circle cx="17" cy="11" r="5" fill="var(--status-heads-up)" />
            <circle cx="25" cy="16" r="3.6" fill="var(--status-plenty-left)" />
          </svg>
          <div>
            <div className="text-lg font-bold leading-none tracking-tight">
              Spent
            </div>
            <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.08em] text-muted-foreground">
              YOUR MONEY · OPEN SOURCE
            </div>
          </div>
        </div>

        <Stepper step={step} />

        <div className="hidden text-xs text-muted-foreground md:block">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Docs
          </a>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-16 md:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
          >
            {step === 1 && <BankStep onComplete={() => setStep(2)} />}
            {step === 2 && (
              <AIStep
                onComplete={() => setStep(3)}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && <CompleteStep onFinish={() => router.push("/")} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function Stepper({ step }: { step: StepIndex }) {
  return (
    <div className="flex items-center gap-3">
      {STEPS.map((s, i) => {
        const state =
          step > s.n ? "done" : step === s.n ? "active" : "todo";
        return (
          <div key={s.n} className="flex items-center gap-3">
            <StepBadge n={s.n} label={s.label} state={state} />
            {i < STEPS.length - 1 && (
              <motion.div
                animate={{
                  background:
                    step > s.n
                      ? "var(--primary)"
                      : "var(--border)",
                }}
                transition={{ duration: 0.35 }}
                className="h-[2px] w-10 rounded-full"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepBadge({
  n,
  label,
  state,
}: {
  n: number;
  label: string;
  state: "todo" | "active" | "done";
}) {
  const bg =
    state === "active"
      ? "var(--primary)"
      : state === "done"
        ? "color-mix(in oklch, var(--primary) 18%, transparent)"
        : "var(--muted)";
  const fg =
    state === "active"
      ? "var(--primary-foreground)"
      : state === "done"
        ? "var(--primary)"
        : "var(--muted-foreground)";
  return (
    <div className="flex items-center gap-2.5">
      <motion.div
        animate={{ background: bg, color: fg }}
        transition={{ duration: 0.25 }}
        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
      >
        <AnimatePresence mode="wait">
          {state === "done" ? (
            <motion.span
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              ✓
            </motion.span>
          ) : (
            <motion.span
              key="num"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              {n}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
      <div
        className={`text-sm tracking-tight transition-colors ${
          state === "todo"
            ? "text-muted-foreground"
            : state === "active"
              ? "font-bold text-foreground"
              : "font-semibold text-foreground"
        }`}
      >
        {label}
      </div>
    </div>
  );
}
