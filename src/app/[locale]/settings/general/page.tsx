"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { SectionShell, SettingCard } from "@/components/settings/section-shell";
import { WorkspaceNameCard } from "@/components/settings/workspace-controls";
import { Button } from "@/components/ui/button";
import { Input, InputGroup } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Locale } from "@/i18n/routing";
import { getSettings, getSummary, updateSettings } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthStartLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function GeneralSettingsPage() {
  const t = useTranslations("settings.general");
  const tCommon = useTranslations("common");
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const { data: summary } = useQuery({
    queryKey: ["summary", monthStartLocalISO(), todayLocalISO()],
    queryFn: () => getSummary({ from: monthStartLocalISO(), to: todayLocalISO() }),
  });

  return (
    <SectionShell title={t("title")} description={t("description")}>
      <WorkspaceNameCard />
      {settings ? (
        <>
          <MonthlyTargetCard
            key={`target:${settings.monthlyTarget ?? "null"}`}
            initialTarget={settings.monthlyTarget}
            typicalMonthly={summary?.typicalMonthly ?? null}
          />
          <GeneralForm
            key={`${settings.monthsToSync}:${settings.paydayDay}`}
            initialMonths={settings.monthsToSync}
            initialPayday={settings.paydayDay}
          />
          <AutoSyncCard
            key={`auto:${settings.autoSyncEnabled}:${settings.autoSyncTime}`}
            initialEnabled={settings.autoSyncEnabled}
            initialTime={settings.autoSyncTime}
          />
          <AtmCard
            key={`atm:${settings.treatAtmAsTransfers}`}
            initialEnabled={settings.treatAtmAsTransfers}
          />
        </>
      ) : (
        <SettingCard>
          <div className="text-sm text-muted-foreground">{tCommon("loading")}</div>
        </SettingCard>
      )}
    </SectionShell>
  );
}

function MonthlyTargetCard({
  initialTarget,
  typicalMonthly,
}: {
  initialTarget: number | null;
  typicalMonthly: number | null;
}) {
  const t = useTranslations("settings.general");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [value, setValue] = useState(initialTarget != null ? String(initialTarget) : "");

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success(tCommon("saved"));
    },
  });

  const parsed = value.trim() === "" ? null : Number(value);
  const valid = parsed == null || (Number.isFinite(parsed) && parsed >= 0);
  const dirty = (parsed ?? null) !== (initialTarget ?? null) && valid;

  return (
    <div id="section-monthly-target">
      <SettingCard title={t("monthlyTargetTitle")} description={t("monthlyTargetDescription")}>
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="monthly-target">{t("monthlyTargetLabel")}</Label>
          <InputGroup prefix="₪">
            <Input
              id="monthly-target"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder={t("monthlyTargetPlaceholder")}
              className="text-end tabular-nums"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </InputGroup>
          {typicalMonthly != null ? (
            <p className="text-[11px] text-muted-foreground">
              {t("typicalLast3", {
                amount: formatCurrency(typicalMonthly, "ILS", locale),
              })}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">{t("noPriorHistory")}</p>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            onClick={() => mutation.mutate({ monthlyTarget: parsed })}
            disabled={!dirty || mutation.isPending}
          >
            {mutation.isPending ? tCommon("saving") : tCommon("saveChanges")}
          </Button>
        </div>
      </SettingCard>
    </div>
  );
}

function GeneralForm({
  initialMonths,
  initialPayday,
}: {
  initialMonths: number;
  initialPayday: number;
}) {
  const t = useTranslations("settings.general");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [months, setMonths] = useState(String(initialMonths));
  const [paydayDay, setPaydayDay] = useState(String(initialPayday));

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success(tCommon("saved"));
    },
  });

  const dirty = Number(months) !== initialMonths || Number(paydayDay) !== initialPayday;

  return (
    <SettingCard title={t("syncWindowTitle")} description={t("syncWindowDescription")}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-medium text-foreground/80">{t("monthsToSync")}</div>
          <Select value={months} onValueChange={(v) => v && setMonths(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 6, 12].map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} {m === 1 ? tCommon("month") : tCommon("months")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{t("banksLimit")}</p>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium text-foreground/80">{t("payday")}</div>
          <Select value={paydayDay} onValueChange={(v) => v && setPaydayDay(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {t("ordinalOfMonth", { ordinal: String(d) })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{t("paydayHint")}</p>
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button
          onClick={() =>
            mutation.mutate({
              monthsToSync: Number(months),
              paydayDay: Number(paydayDay),
            })
          }
          disabled={!dirty || mutation.isPending}
        >
          {mutation.isPending ? tCommon("saving") : tCommon("saveChanges")}
        </Button>
      </div>
    </SettingCard>
  );
}

function AutoSyncCard({
  initialEnabled,
  initialTime,
}: {
  initialEnabled: boolean;
  initialTime: string;
}) {
  const t = useTranslations("settings.general");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [time, setTime] = useState(initialTime);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
      toast.success(tCommon("saved"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("failedToSave"));
    },
  });

  const timeValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const dirty = timeValid && (enabled !== initialEnabled || time !== initialTime);

  return (
    <SettingCard title={t("autoSyncTitle")} description={t("autoSyncDescription")}>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="auto-sync-toggle" className="text-sm font-medium">
            {t("dailyAutoSync")}
          </Label>
          <p className="text-[11px] text-muted-foreground">{t("runsInIsraelTime")}</p>
        </div>
        <Switch id="auto-sync-toggle" checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div className="mt-5 grid gap-2 sm:max-w-xs">
        <Label htmlFor="auto-sync-time" className="text-xs font-medium text-foreground/80">
          {t("timeOfDay")}
        </Label>
        <Input
          id="auto-sync-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={!enabled}
          className="tabular-nums"
        />
        <p className="text-[11px] text-muted-foreground">{t("timeOfDayHint")}</p>
      </div>
      <div className="mt-5 flex justify-end">
        <Button
          onClick={() => mutation.mutate({ autoSyncEnabled: enabled, autoSyncTime: time })}
          disabled={!dirty || mutation.isPending}
        >
          {mutation.isPending ? tCommon("saving") : tCommon("saveChanges")}
        </Button>
      </div>
    </SettingCard>
  );
}

function AtmCard({ initialEnabled }: { initialEnabled: boolean }) {
  const t = useTranslations("settings.general");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initialEnabled);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(tCommon("saved"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("failedToSave"));
    },
  });

  const dirty = enabled !== initialEnabled;

  return (
    <SettingCard title={t("atmTitle")} description={t("atmDescription")}>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="atm-transfer-toggle" className="text-sm font-medium">
            {t("atmToggleLabel")}
          </Label>
          <p className="text-[11px] text-muted-foreground">{t("atmToggleHint")}</p>
        </div>
        <Switch id="atm-transfer-toggle" checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div className="mt-5 flex justify-end">
        <Button
          onClick={() => mutation.mutate({ treatAtmAsTransfers: enabled })}
          disabled={!dirty || mutation.isPending}
        >
          {mutation.isPending ? tCommon("saving") : tCommon("saveChanges")}
        </Button>
      </div>
    </SettingCard>
  );
}
