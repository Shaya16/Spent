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

  const allFieldsFilled =
    bankInfo?.credentialFields.every((f) => credentials[f.key]?.trim()) ??
    false;

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

        {bankInfo?.credentialFields.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={field.key}>{field.label}</Label>
            <Input
              id={field.key}
              type={field.type}
              value={credentials[field.key] ?? ""}
              onChange={(e) =>
                setCredentials((prev) => ({
                  ...prev,
                  [field.key]: e.target.value,
                }))
              }
              placeholder={field.label}
            />
          </div>
        ))}

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
            disabled={!allFieldsFilled || testing}
            className="flex-1"
          >
            {testing ? "Testing..." : "Test Connection"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!allFieldsFilled || saving}
            className="flex-1"
          >
            {saving ? "Saving..." : "Save & Continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
