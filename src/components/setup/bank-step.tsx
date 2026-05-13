"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BANK_PROVIDERS } from "@/lib/types";
import { saveBankCredentials, testBankConnection } from "@/lib/api";

interface BankStepProps {
  onComplete: () => void;
}

export function BankStep({ onComplete }: BankStepProps) {
  const [provider, setProvider] = useState("isracard");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const bankInfo = BANK_PROVIDERS.find((b) => b.id === provider);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveBankCredentials(provider, credentials);
      onComplete();
    } catch {
      setTestResult({ success: false, message: "Failed to save credentials" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await saveBankCredentials(provider, credentials);
      const result = await testBankConnection(provider);
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: "Connection test failed" });
    } finally {
      setTesting(false);
    }
  };

  const allFieldsValid =
    bankInfo?.credentialFields.every((f) => {
      const v = credentials[f.key]?.trim() ?? "";
      if (!v) return false;
      if (f.exactLength != null && v.length !== f.exactLength) return false;
      return true;
    }) ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your bank</CardTitle>
        <CardDescription>
          Your credentials are encrypted and stored locally. They never leave
          your machine.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Bank / Card provider</Label>
          <Select value={provider} onValueChange={(v) => v && setProvider(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BANK_PROVIDERS.map((bank) => (
                <SelectItem
                  key={bank.id}
                  value={bank.id}
                  disabled={!bank.enabled}
                >
                  {bank.name}
                  {!bank.enabled && " (coming soon)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {bankInfo?.credentialFields.map((field) => {
          const value = credentials[field.key] ?? "";
          const tooShort =
            field.exactLength != null &&
            value.length > 0 &&
            value.length !== field.exactLength;
          return (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                type={field.type}
                inputMode={field.numeric ? "numeric" : undefined}
                pattern={field.numeric ? "[0-9]*" : undefined}
                maxLength={field.maxLength ?? field.exactLength ?? undefined}
                value={value}
                onChange={(e) => {
                  let next = e.target.value;
                  if (field.numeric) next = next.replace(/\D/g, "");
                  if (field.exactLength) next = next.slice(0, field.exactLength);
                  if (field.maxLength) next = next.slice(0, field.maxLength);
                  setCredentials((prev) => ({ ...prev, [field.key]: next }));
                }}
                placeholder={field.placeholder ?? field.label}
                aria-invalid={tooShort || undefined}
              />
              {field.hint && (
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              )}
              {tooShort && (
                <p className="text-xs text-destructive">
                  Must be exactly {field.exactLength} digits.
                </p>
              )}
            </div>
          );
        })}

        {testResult && (
          <div
            className={`rounded-md p-3 text-sm ${
              testResult.success
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {testResult.message}
            {testResult.success && " You can proceed to the next step."}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={!allFieldsValid || testing}
            className="flex-1"
          >
            {testing ? "Testing..." : "Test Connection"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!allFieldsValid || saving}
            className="flex-1"
          >
            {saving ? "Saving..." : "Save & Continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
