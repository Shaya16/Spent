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
import { Input, InputGroup } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionShell, SettingCard } from "@/components/settings/section-shell";
import { WorkspaceNameCard } from "@/components/settings/workspace-controls";
import { getSettings, getSummary, updateSettings } from "@/lib/api";

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
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const { data: summary } = useQuery({
    queryKey: ["summary", monthStartLocalISO(), todayLocalISO()],
    queryFn: () => getSummary({ from: monthStartLocalISO(), to: todayLocalISO() }),
  });

  return (
    <SectionShell
      title="General"
      description="Workspace name, monthly target, sync window, and when your monthly cycle resets."
    >
      <WorkspaceNameCard />
      {settings ? (
        <>
          <MonthlyTargetCard
            key={`target:${settings.monthlyTarget ?? "null"}`}
            initialTarget={settings.monthlyTarget}
            typicalMonthly={summary?.typicalMonthly ?? null}
          />
          <GeneralForm
            key={settings.monthsToSync + ":" + settings.paydayDay}
            initialMonths={settings.monthsToSync}
            initialPayday={settings.paydayDay}
          />
        </>
      ) : (
        <SettingCard>
          <div className="text-sm text-muted-foreground">Loading…</div>
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
  const queryClient = useQueryClient();
  const [value, setValue] = useState(
    initialTarget != null ? String(initialTarget) : ""
  );

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success("Saved");
    },
  });

  const parsed = value.trim() === "" ? null : Number(value);
  const valid = parsed == null || (Number.isFinite(parsed) && parsed >= 0);
  const dirty =
    (parsed ?? null) !== (initialTarget ?? null) && valid;

  return (
    <div id="section-monthly-target">
      <SettingCard
        title="Monthly target"
        description="A single number that drives your dashboard pace verdict. Leave blank to hide the verdict."
      >
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="monthly-target">Monthly spending target</Label>
          <InputGroup prefix="₪">
            <Input
              id="monthly-target"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="e.g. 10000"
              className="text-right tabular-nums"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </InputGroup>
          {typicalMonthly != null ? (
            <p className="text-[11px] text-muted-foreground">
              Typical last 3 months: ₪
              {typicalMonthly.toLocaleString("en-IL")} / mo
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No prior month history yet. Set a target you'd like to aim for.
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            onClick={() =>
              mutation.mutate({ monthlyTarget: parsed })
            }
            disabled={!dirty || mutation.isPending}
          >
            {mutation.isPending ? "Saving..." : "Save changes"}
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
