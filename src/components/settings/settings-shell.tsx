"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/app-shell";
import { GeneralSection } from "./general-section";
import { AppearanceSection } from "./appearance-section";
import { IntegrationsSection } from "./integrations-section";
import { AISection } from "./ai-section";
import { BudgetsSection } from "./budgets-section";
import { PrivacySection } from "./privacy-section";

type Section =
  | "general"
  | "integrations"
  | "ai"
  | "budgets"
  | "appearance"
  | "privacy";

const TABS: { id: Section; label: string }[] = [
  { id: "general", label: "General" },
  { id: "integrations", label: "Integrations" },
  { id: "ai", label: "AI" },
  { id: "budgets", label: "Budgets" },
  { id: "appearance", label: "Appearance" },
  { id: "privacy", label: "Privacy & Debug" },
];

export function SettingsShell() {
  const [section, setSection] = useState<Section>("general");

  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto max-w-5xl px-6 pt-6 md:px-8">
        <div className="flex flex-wrap gap-1 border-b border-border/40">
          {TABS.map((t) => {
            const active = section === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSection(t.id)}
                className={`relative px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {active && (
                  <motion.div
                    layoutId="settings-tab"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                    transition={{ type: "spring", damping: 24, stiffness: 220 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8 md:px-8">
        {section === "general" && <GeneralSection />}
        {section === "integrations" && <IntegrationsSection />}
        {section === "ai" && <AISection />}
        {section === "budgets" && <BudgetsSection />}
        {section === "appearance" && <AppearanceSection />}
        {section === "privacy" && <PrivacySection />}
      </div>
    </>
  );
}
