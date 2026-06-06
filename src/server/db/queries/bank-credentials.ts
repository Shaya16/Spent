import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { BANK_PROVIDERS } from "@/lib/types";
import { decrypt, encrypt } from "../../lib/encryption";
import { getDb } from "../index";
import { getOrm } from "../orm";
import { bankCredentials } from "../schema";

/** Display name only. Must not store secrets (passwords, tokens, keys). */
export const BANK_CREDENTIAL_LABEL_MAX_LENGTH = 128;

interface SaveOptions {
  requiresManualTwoFactor?: boolean;
}

export interface BankCredentialMeta {
  id: number;
  provider: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  requiresManualTwoFactor: boolean;
  hasTwoFactorToken: boolean;
}

function providerDisplayName(provider: string): string {
  return BANK_PROVIDERS.find((b) => b.id === provider)?.name ?? provider;
}

function normalizeLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error("Label is required");
  }
  if (trimmed.length > BANK_CREDENTIAL_LABEL_MAX_LENGTH) {
    throw new Error(`Label must be ${BANK_CREDENTIAL_LABEL_MAX_LENGTH} characters or fewer`);
  }
  return trimmed;
}

export function defaultLabelForProvider(workspaceId: number, provider: string): string {
  const base = providerDisplayName(provider);
  const rows = getOrm()
    .select({ label: bankCredentials.label })
    .from(bankCredentials)
    .where(
      and(eq(bankCredentials.workspaceId, workspaceId), eq(bankCredentials.provider, provider)),
    )
    .all();

  if (rows.length === 0) return base;

  const used = new Set(rows.map((r) => r.label));
  if (!used.has(base)) return base;

  let n = 2;
  while (used.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

export function getBankCredentialMeta(
  workspaceId: number,
  credentialId: number,
): BankCredentialMeta | null {
  const row = getOrm()
    .select({
      id: bankCredentials.id,
      provider: bankCredentials.provider,
      label: bankCredentials.label,
      createdAt: bankCredentials.createdAt,
      updatedAt: bankCredentials.updatedAt,
      requiresManualTwoFactor: bankCredentials.requiresManualTwoFactor,
    })
    .from(bankCredentials)
    .where(and(eq(bankCredentials.workspaceId, workspaceId), eq(bankCredentials.id, credentialId)))
    .get();

  if (!row) return null;

  let hasToken = false;
  try {
    const creds = getBankCredentials(workspaceId, credentialId);
    hasToken = Boolean(creds?.otpLongTermToken);
  } catch {
    hasToken = false;
  }

  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    requiresManualTwoFactor: Boolean(row.requiresManualTwoFactor),
    hasTwoFactorToken: hasToken,
  };
}

export function saveBankCredentials(
  workspaceId: number,
  provider: string,
  credentials: Record<string, string>,
  options: SaveOptions & { credentialId?: number; label?: string } = {},
): number {
  const { encrypted, iv, authTag } = encrypt(JSON.stringify(credentials));
  const requiresFlag =
    options.requiresManualTwoFactor === undefined ? null : options.requiresManualTwoFactor ? 1 : 0;

  const orm = getOrm();

  if (options.credentialId != null) {
    const rawLabel =
      options.label?.trim() ||
      getBankCredentialMeta(workspaceId, options.credentialId)?.label ||
      "";
    const label = normalizeLabel(rawLabel);
    orm
      .update(bankCredentials)
      .set({
        credentialsEncrypted: encrypted,
        iv,
        authTag,
        label,
        ...(requiresFlag === null ? {} : { requiresManualTwoFactor: requiresFlag }),
        updatedAt: sql`datetime('now')`,
      })
      .where(
        and(
          eq(bankCredentials.workspaceId, workspaceId),
          eq(bankCredentials.id, options.credentialId),
        ),
      )
      .run();
    return options.credentialId;
  }

  const label = normalizeLabel(
    options.label?.trim() || defaultLabelForProvider(workspaceId, provider),
  );

  const result = orm
    .insert(bankCredentials)
    .values({
      workspaceId,
      provider,
      label,
      credentialsEncrypted: encrypted,
      iv,
      authTag,
      ...(requiresFlag === null ? {} : { requiresManualTwoFactor: requiresFlag }),
      updatedAt: sql`datetime('now')`,
    })
    .run();
  return Number(result.lastInsertRowid);
}

export function getBankCredentials(
  workspaceId: number,
  credentialId: number,
): Record<string, string> | null {
  const row = getOrm()
    .select({
      credentialsEncrypted: bankCredentials.credentialsEncrypted,
      iv: bankCredentials.iv,
      authTag: bankCredentials.authTag,
    })
    .from(bankCredentials)
    .where(and(eq(bankCredentials.workspaceId, workspaceId), eq(bankCredentials.id, credentialId)))
    .get();

  if (!row) return null;

  const json = decrypt({
    encrypted: row.credentialsEncrypted as Buffer,
    iv: row.iv as Buffer,
    authTag: row.authTag as Buffer,
  });

  return JSON.parse(json);
}

export function getRequiresManualTwoFactor(workspaceId: number, credentialId: number): boolean {
  const row = getOrm()
    .select({ requiresManualTwoFactor: bankCredentials.requiresManualTwoFactor })
    .from(bankCredentials)
    .where(and(eq(bankCredentials.workspaceId, workspaceId), eq(bankCredentials.id, credentialId)))
    .get();
  return Boolean(row?.requiresManualTwoFactor);
}

export function setRequiresManualTwoFactor(
  workspaceId: number,
  credentialId: number,
  value: boolean,
): void {
  getOrm()
    .update(bankCredentials)
    .set({ requiresManualTwoFactor: value ? 1 : 0, updatedAt: sql`datetime('now')` })
    .where(and(eq(bankCredentials.workspaceId, workspaceId), eq(bankCredentials.id, credentialId)))
    .run();
}

export function updateCredentialField(
  workspaceId: number,
  credentialId: number,
  key: string,
  value: string | null,
): void {
  const meta = getBankCredentialMeta(workspaceId, credentialId);
  if (!meta) return;
  const existing = getBankCredentials(workspaceId, credentialId);
  if (!existing) return;
  const next = { ...existing };
  if (value === null) {
    delete next[key];
  } else {
    next[key] = value;
  }
  saveBankCredentials(workspaceId, meta.provider, next, { credentialId });
}

export function hasBankCredentials(workspaceId: number): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM bank_credentials WHERE workspace_id = ?")
    .get(workspaceId) as { count: number };
  return row.count > 0;
}

/** True when any workspace has at least one connected bank. Gates first-run setup. */
export function anyWorkspaceHasBankCredentials(): boolean {
  const row = getDb().prepare("SELECT COUNT(*) as count FROM bank_credentials").get() as {
    count: number;
  };
  return row.count > 0;
}

export function deleteBankCredentials(workspaceId: number, credentialId: number): void {
  getOrm()
    .delete(bankCredentials)
    .where(and(eq(bankCredentials.workspaceId, workspaceId), eq(bankCredentials.id, credentialId)))
    .run();
}

export function listBankCredentials(workspaceId: number): BankCredentialMeta[] {
  const rows = getOrm()
    .select({
      id: bankCredentials.id,
      provider: bankCredentials.provider,
      label: bankCredentials.label,
      createdAt: bankCredentials.createdAt,
      updatedAt: bankCredentials.updatedAt,
      requiresManualTwoFactor: bankCredentials.requiresManualTwoFactor,
    })
    .from(bankCredentials)
    .where(eq(bankCredentials.workspaceId, workspaceId))
    .orderBy(asc(bankCredentials.provider), asc(bankCredentials.label))
    .all();

  return rows.map((r) => {
    let hasToken = false;
    try {
      const creds = getBankCredentials(workspaceId, r.id);
      hasToken = Boolean(creds?.otpLongTermToken);
    } catch {
      hasToken = false;
    }
    return {
      id: r.id,
      provider: r.provider,
      label: r.label,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      requiresManualTwoFactor: Boolean(r.requiresManualTwoFactor),
      hasTwoFactorToken: hasToken,
    };
  });
}
