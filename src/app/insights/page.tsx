import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/layout/app-shell";
import { InsightsView } from "@/components/insights/insights-view";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const t = await getTranslations("insights");
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl p-4">
        <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>
        <InsightsView />
      </div>
    </AppShell>
  );
}
