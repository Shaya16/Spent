import "server-only";

import { BANK_PROVIDERS } from "@/lib/types";
import { decrypt, encrypt } from "../../lib/encryption";
import { getDb } from "../index";

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

interface ListRow {
  id: number;
  provider: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  requires_manual_two_factor: number;
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
  const rows = getDb()
    .prepare(
      `SELECT label FROM bank_credentials
       WHERE workspace_id = ? AND provider = ?`,
    )
    .all(workspaceId, provider) as { label: string }[];

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
  const row = getDb()
    .prepare(
      `SELECT id, provider, label, created_at as createdAt, updated_at as updatedAt,
              requires_manual_two_factor
       FROM bank_credentials
       WHERE workspace_id = ? AND id = ?`,
    )
    .get(workspaceId, credentialId) as ListRow | undefined;

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
    requiresManualTwoFactor: Boolean(row.requires_manual_two_factor),
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

  const db = getDb();

  if (options.credentialId != null) {
    const rawLabel =
      options.label?.trim() ||
      getBankCredentialMeta(workspaceId, options.credentialId)?.label ||
      "";
    const label = normalizeLabel(rawLabel);
    if (requiresFlag === null) {
      db.prepare(
        `UPDATE bank_credentials SET
           credentials_encrypted = ?, iv = ?, auth_tag = ?, label = ?,
           updated_at = datetime('now')
         WHERE workspace_id = ? AND id = ?`,
      ).run(encrypted, iv, authTag, label, workspaceId, options.credentialId);
    } else {
      db.prepare(
        `UPDATE bank_credentials SET
           credentials_encrypted = ?, iv = ?, auth_tag = ?, label = ?,
           requires_manual_two_factor = ?, updated_at = datetime('now')
         WHERE workspace_id = ? AND id = ?`,
      ).run(encrypted, iv, authTag, label, requiresFlag, workspaceId, options.credentialId);
    }
    return options.credentialId;
  }

  const label = normalizeLabel(
    options.label?.trim() || defaultLabelForProvider(workspaceId, provider),
  );

  if (requiresFlag === null) {
    const result = db
      .prepare(
        `INSERT INTO bank_credentials (
           workspace_id, provider, label, credentials_encrypted, iv, auth_tag, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(workspaceId, provider, label, encrypted, iv, authTag);
    return Number(result.lastInsertRowid);
  }

  const result = db
    .prepare(
      `INSERT INTO bank_credentials (
         workspace_id, provider, label, credentials_encrypted, iv, auth_tag,
         requires_manual_two_factor, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(workspaceId, provider, label, encrypted, iv, authTag, requiresFlag);
  return Number(result.lastInsertRowid);
}

export function getBankCredentials(
  workspaceId: number,
  credentialId: number,
): Record<string, string> | null {
  const row = getDb()
    .prepare(
      `SELECT credentials_encrypted, iv, auth_tag
       FROM bank_credentials WHERE workspace_id = ? AND id = ?`,
    )
    .get(workspaceId, credentialId) as
    | { credentials_encrypted: Buffer; iv: Buffer; auth_tag: Buffer }
    | undefined;

  if (!row) return null;

  const json = decrypt({
    encrypted: row.credentials_encrypted,
    iv: row.iv,
    authTag: row.auth_tag,
  });

  return JSON.parse(json);
}

export function getRequiresManualTwoFactor(workspaceId: number, credentialId: number): boolean {
  const row = getDb()
    .prepare(
      `SELECT requires_manual_two_factor FROM bank_credentials
       WHERE workspace_id = ? AND id = ?`,
    )
    .get(workspaceId, credentialId) as { requires_manual_two_factor: number } | undefined;
  return Boolean(row?.requires_manual_two_factor);
}

export function setRequiresManualTwoFactor(
  workspaceId: number,
  credentialId: number,
  value: boolean,
): void {
  getDb()
    .prepare(
      `UPDATE bank_credentials SET requires_manual_two_factor = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`,
    )
    .run(value ? 1 : 0, workspaceId, credentialId);
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

export function deleteBankCredentials(workspaceId: number, credentialId: number): void {
  getDb()
    .prepare("DELETE FROM bank_credentials WHERE workspace_id = ? AND id = ?")
    .run(workspaceId, credentialId);
}

export function listBankCredentials(workspaceId: number): BankCredentialMeta[] {
  const rows = getDb()
    .prepare(
      `SELECT id, provider, label, created_at as createdAt, updated_at as updatedAt,
              requires_manual_two_factor
       FROM bank_credentials WHERE workspace_id = ? ORDER BY provider, label`,
    )
    .all(workspaceId) as ListRow[];

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
      requiresManualTwoFactor: Boolean(r.requires_manual_two_factor),
      hasTwoFactorToken: hasToken,
    };
  });
}
