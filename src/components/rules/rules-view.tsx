"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRule, deleteRule, getCategories, listRules } from "@/lib/api";
import type { Rule } from "@/server/rules/engine";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

export function RulesView() {
  const t = useTranslations("rules");
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [field, setField] = useState<Rule["field"]>("merchant");
  const [op, setOp] = useState<Rule["op"]>("contains");
  const [value, setValue] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [kind, setKind] = useState("");
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    listRules().then(setRules).catch(() => setError(true));
  }, []);

  useEffect(() => {
    refresh();
    getCategories("expense").then((c) => setCategories(c)).catch(() => {});
  }, [refresh]);

  const ops: Rule["op"][] = field === "amount" ? ["gt", "lt"] : ["contains", "equals", "regex"];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    try {
      await createRule({
        field,
        op,
        value,
        categoryId: categoryId ? Number(categoryId) : undefined,
        kind: (kind || undefined) as Rule["kind"],
      });
      setValue("");
      refresh();
    } catch {
      setError(true);
    }
  }

  const categoryName = (id?: number) => categories.find((c) => c.id === id)?.name;

  return (
    <div className="grid gap-6">
      <p className="text-muted-foreground">{t("description")}</p>

      <Card>
        <CardHeader>
          <CardTitle>{t("add")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rule-field">{t("when")}</Label>
              <select
                id="rule-field"
                className={selectClass}
                value={field}
                onChange={(e) => {
                  const f = e.target.value as Rule["field"];
                  setField(f);
                  setOp(f === "amount" ? "gt" : "contains");
                }}
              >
                {(["merchant", "amount", "account"] as const).map((f) => (
                  <option key={f} value={f}>{t(f)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-op">&nbsp;</Label>
              <select id="rule-op" className={selectClass} value={op} onChange={(e) => setOp(e.target.value as Rule["op"])}>
                {ops.map((o) => (
                  <option key={o} value={o}>{t(o)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="rule-value">{t("value")}</Label>
              <Input id="rule-value" value={value} onChange={(e) => setValue(e.target.value)} required maxLength={200} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-category">{t("setCategory")}</Label>
              <select id="rule-category" className={selectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{t("none")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-kind">{t("markAs")}</Label>
              <select id="rule-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">{t("none")}</option>
                {(["expense", "income", "transfer"] as const).map((k) => (
                  <option key={k} value={k}>{t(k)}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!value.trim() || (!categoryId && !kind)}>{t("add")}</Button>
              {error ? <span role="alert" className="ms-3 text-sm text-destructive">{t("saveFailed")}</span> : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {rules.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <span>
                {t(r.field)} {t(r.op)} <bdi className="font-medium">{r.value}</bdi>
                {" → "}
                {[categoryName(r.categoryId), r.kind ? t(r.kind) : null].filter(Boolean).join(", ")}
              </span>
              <Button variant="ghost" size="sm" onClick={() => deleteRule(r.id).then(refresh)}>{t("delete")}</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
