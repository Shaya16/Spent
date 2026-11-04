"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInsights, type InsightsPayload } from "@/lib/api";

const money = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;

export function InsightsView() {
  const t = useTranslations("insights");
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getInsights().then(setData).catch(() => setFailed(true));
  }, []);

  if (failed) return <p role="alert">{t("couldntLoad")}</p>;
  if (!data) return null;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("forecast")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3">
            {data.forecast.map((f) => (
              <li key={f.date} className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="tabular-nums" dir="ltr">{f.date}</span>
                <span className="text-lg font-semibold tabular-nums">{money(f.total)}</span>
                <span className="w-full text-sm text-muted-foreground">
                  {t("posted")} {money(f.parts.posted)} · {t("recurring")} {money(f.parts.recurring)} · {t("installments")} {money(f.parts.installments)} · {t("other")} {money(f.parts.discretionary)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("subscriptions")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.series.length === 0 ? (
            <p className="text-muted-foreground">{t("noSubscriptions")}</p>
          ) : (
            <ul className="grid gap-3">
              {data.series.map((s) => (
                <li key={`${s.merchant}|${s.currency}`} className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="font-medium">
                    {s.merchant}
                    {s.status === "candidate" ? <span className="ms-2 text-sm text-muted-foreground">({t("maybe")})</span> : null}
                  </span>
                  <span className="tabular-nums">
                    {money(s.expectedAmount)} · {t(s.cadence)}
                  </span>
                  {s.priceChange ? (
                    <span className="w-full text-sm text-amber-600">
                      {t("priceChanged", { from: money(s.priceChange.from), to: money(s.priceChange.to) })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("anomalies")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.anomalies.length === 0 ? (
            <p className="text-muted-foreground">{t("noAnomalies")}</p>
          ) : (
            <ul className="grid gap-2">
              {data.anomalies.map((a, i) => (
                <li key={i}>{a.detail}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
