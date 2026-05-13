"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getSettings, updateSettings } from "@/lib/api";
import { toast } from "sonner";
import { SectionShell, SettingCard } from "./section-shell";

export function GeneralSection() {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  if (!settings) {
    return (
      <SectionShell title="General">
        <SettingCard>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </SettingCard>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="General"
      description="Control how far back syncs reach and when your monthly cycle resets."
    >
      <GeneralForm
        key={settings.monthsToSync + ":" + settings.paydayDay}
        initialMonths={settings.monthsToSync}
        initialPayday={settings.paydayDay}
      />
    </SectionShell>
  );
}

function GeneralForm({
  initialMonths,
  initialPayday,
}: {
  initialMonths: number;
  initialPayday: number;
}) {
  const queryClient = useQueryClient();
  const [months, setMonths] = useState(String(initialMonths));
  const [paydayDay, setPaydayDay] = useState(String(initialPayday));

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success("General settings saved");
    },
  });

  const dirty =
    Number(months) !== initialMonths || Number(paydayDay) !== initialPayday;

  return (
    <>
      <SettingCard
        title="Months to sync"
        description="How far back each sync reaches. Banks limit history to roughly 12 months."
      >
        <Select value={months} onValueChange={(v) => v && setMonths(v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 6, 12].map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m} {m === 1 ? "month" : "months"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingCard>

      <SettingCard
        title="Payday"
        description='Day of the month you get paid. Powers the "days until payday" hint and daily-allowance math.'
      >
        <Select value={paydayDay} onValueChange={(v) => v && setPaydayDay(v)}>
          <SelectTrigger className="w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <SelectItem key={d} value={String(d)}>
                {ordinal(d)} of the month
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingCard>

      <div className="flex justify-end">
        <Button
          onClick={() =>
            mutation.mutate({
              monthsToSync: Number(months),
              paydayDay: Number(paydayDay),
            })
          }
          disabled={!dirty || mutation.isPending}
        >
          {mutation.isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
