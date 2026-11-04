import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { RulesView } from "@/components/rules/rules-view";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const t = await getTranslations("rules");
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl p-4">
        <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>
        <RulesView />
      </div>
    </AppShell>
  );
}
