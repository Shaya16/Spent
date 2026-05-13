"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BankStep } from "@/components/setup/bank-step";
import { AIStep } from "@/components/setup/ai-step";
import { CompleteStep } from "@/components/setup/complete-step";

const STEPS = ["Bank", "AI", "Done"] as const;

export function SetupWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Spent</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set up your personal finance tracker
          </p>
        </div>

        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  i < currentStep
                    ? "bg-primary text-primary-foreground"
                    : i === currentStep
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < currentStep ? "✓" : i + 1}
              </div>
              <span
                className={`text-sm ${i === currentStep ? "font-medium" : "text-muted-foreground"}`}
              >
                {step}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px w-8 ${i < currentStep ? "bg-primary" : "bg-border"}`}
                />
              )}
            </div>
          ))}
        </div>

        {currentStep === 0 && (
          <BankStep onComplete={() => setCurrentStep(1)} />
        )}
        {currentStep === 1 && (
          <AIStep onComplete={() => setCurrentStep(2)} />
        )}
        {currentStep === 2 && (
          <CompleteStep onFinish={() => router.push("/")} />
        )}
      </div>
    </div>
  );
}
