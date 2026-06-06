import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export async function ChatDisabled() {
  const t = await getTranslations("chat");
  return (
    <>
      <PageHeader title={t("title")} meta={t("meta")} />
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-serif text-2xl tracking-tight">{t("disabledTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("disabledBody")}</p>
          </div>
          <Button variant="default" render={<Link href="/settings/ai">{t("disabledCta")}</Link>} />
        </div>
      </div>
    </>
  );
}
