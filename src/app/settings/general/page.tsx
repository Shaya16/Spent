"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SectionShell, SettingCard } from "@/components/settings/section-shell";
import { WorkspaceNameCard } from "@/components/settings/workspace-controls";
import { getSettings, updateSettings } from "@/lib/api";

export default function GeneralSettingsPage() {
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  return (
    <SectionShell
      title="General"
      description="Workspace name, how far back syncs reach, and when your monthly cycle resets."
    >
      <WorkspaceNameCard />
      {settings ? (
        <GeneralForm
          key={settings.monthsToSync + ":" + settings.paydayDay}
          initialMonths={settings.monthsToSync}
          initialPayday={settings.paydayDay}
        />
      ) : (
        <SettingCard>
          <div className="text-sm text-muted-foreground">Loading…</div>
        </SettingCard>
      )}
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
      toast.success("Saved");
    },
  });

  const dirty =
    Number(months) !== initialMonths || Number(paydayDay) !== initialPayday;

  return (
    <SettingCard
      title="Sync window & payday"
      description="How far back each sync reaches, and the day your monthly cycle resets."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-medium text-foreground/80">
            Months to sync
          </div>
          <Select value={months} onValueChange={(v) => v && setMonths(v)}>
            <SelectTrigger>
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
          <p className="text-[11px] text-muted-foreground">
            Banks limit history to roughly 12 months.
          </p>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium text-foreground/80">Payday</div>
          <Select value={paydayDay} onValueChange={(v) => v && setPaydayDay(v)}>
            <SelectTrigger>
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
          <p className="text-[11px] text-muted-foreground">
            Powers daily-allowance math and the days-until-payday hint.
          </p>
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
          {mutation.isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </SettingCard>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
