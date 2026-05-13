"use client";

import { useState } from "react";
import Link from "next/link";
import { GeneralSection } from "./general-section";
import { AppearanceSection } from "./appearance-section";
import { IntegrationsSection } from "./integrations-section";
import { AISection } from "./ai-section";
import { BudgetsSection } from "./budgets-section";
import { PrivacySection } from "./privacy-section";

type Section =
  | "general"
  | "appearance"
  | "integrations"
  | "ai"
  | "budgets"
  | "privacy";

interface SectionMeta {
  id: Section;
  label: string;
  description: string;
}

const SECTIONS: SectionMeta[] = [
  {
    id: "general",
    label: "General",
    description: "Sync period and payday",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Banks and credit cards",
  },
  {
    id: "ai",
    label: "AI",
    description: "Categorization provider",
  },
  {
    id: "budgets",
    label: "Budgets",
    description: "Per-category monthly limits",
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Light, dark, or system",
  },
  {
    id: "privacy",
    label: "Privacy & Debug",
    description: "Show browser, reset data",
  },
];

export function SettingsShell() {
  const [section, setSection] = useState<Section>("general");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Dashboard
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <h1 className="font-serif text-xl">Settings</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[220px_1fr] md:px-6 md:py-12">
        <aside className="space-y-1">
          {SECTIONS.map((s) => {
            const active = s.id === section;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`w-full rounded-xl px-4 py-3 text-left transition-colors ${
                  active
                    ? "bg-card"
                    : "hover:bg-card/50"
                }`}
              >
                <div className="font-medium">{s.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {s.description}
                </div>
              </button>
            );
          })}
        </aside>

        <main className="space-y-6">
          {section === "general" && <GeneralSection />}
          {section === "appearance" && <AppearanceSection />}
          {section === "integrations" && <IntegrationsSection />}
          {section === "ai" && <AISection />}
          {section === "budgets" && <BudgetsSection />}
          {section === "privacy" && <PrivacySection />}
        </main>
      </div>
    </div>
  );
}
