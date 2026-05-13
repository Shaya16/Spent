"use client";

import { PageHeader } from "@/components/layout/app-shell";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { GeneralSection } from "./general-section";
import { AppearanceSection } from "./appearance-section";
import { IntegrationsSection } from "./integrations-section";
import { AISection } from "./ai-section";
import { BudgetsSection } from "./budgets-section";
import { PrivacySection } from "./privacy-section";

export function SettingsShell() {
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs defaultValue="general">
        <div className="border-b border-border/40 px-4 md:px-6">
          <div className="mx-auto max-w-5xl">
            <TabsList className="h-12 w-full justify-start gap-1 bg-transparent p-0">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="integrations">Integrations</TabsTrigger>
              <TabsTrigger value="ai">AI</TabsTrigger>
              <TabsTrigger value="budgets">Budgets</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="privacy">Privacy & Debug</TabsTrigger>
            </TabsList>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
          <TabsContent value="general" className="mt-0">
            <GeneralSection />
          </TabsContent>
          <TabsContent value="integrations" className="mt-0">
            <IntegrationsSection />
          </TabsContent>
          <TabsContent value="ai" className="mt-0">
            <AISection />
          </TabsContent>
          <TabsContent value="budgets" className="mt-0">
            <BudgetsSection />
          </TabsContent>
          <TabsContent value="appearance" className="mt-0">
            <AppearanceSection />
          </TabsContent>
          <TabsContent value="privacy" className="mt-0">
            <PrivacySection />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}
