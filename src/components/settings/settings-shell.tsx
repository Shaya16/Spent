"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { GeneralSection } from "./general-section";
import { AppearanceSection } from "./appearance-section";
import { IntegrationsSection } from "./integrations-section";
import { AISection } from "./ai-section";
import { BudgetsSection } from "./budgets-section";
import { PrivacySection } from "./privacy-section";

const SECTIONS = [
  { id: "general", label: "General", Component: GeneralSection },
  { id: "integrations", label: "Bank accounts", Component: IntegrationsSection },
  { id: "ai", label: "AI & automation", Component: AISection },
  { id: "budgets", label: "Budgets", Component: BudgetsSection },
  { id: "appearance", label: "Appearance", Component: AppearanceSection },
  { id: "privacy", label: "Data & privacy", Component: PrivacySection },
] as const;

export function SettingsShell() {
  const [active, setActive] = useState<string>("general");

  // Scroll-spy: update the active section as the user scrolls.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.id.replace("section-", "");
          setActive(id);
        }
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(`section-${s.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const jumpTo = (id: string) => {
    setActive(id);
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto max-w-6xl px-6 pt-6 pb-24 md:px-8">
        <p className="mb-10 text-sm text-muted-foreground">
          Tune Spent to fit how you like to manage your money.
        </p>

        <div className="grid gap-12 lg:grid-cols-[180px_1fr]">
          {/* Section nav */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Settings
              </div>
              <nav className="flex flex-col gap-0.5">
                {SECTIONS.map((s) => {
                  const isActive = active === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => jumpTo(s.id)}
                      className={`-mx-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        isActive
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Stacked sections */}
          <div className="min-w-0 space-y-12">
            {SECTIONS.map((s) => (
              <section
                key={s.id}
                id={`section-${s.id}`}
                className="scroll-mt-24"
              >
                <s.Component />
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
