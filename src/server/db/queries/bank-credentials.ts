import "server-only";

import { getDb } from "../index";
import { encrypt, decrypt } from "../../lib/encryption";

interface SaveOptions {
  requiresManualTwoFactor?: boolean;
}

export function saveBankCredentials(
  workspaceId: number,
  provider: string,
  credentials: Record<string, string>,
  options: SaveOptions = {}
): void {
  const { encrypted, iv, authTag } = encrypt(JSON.stringify(credentials));
  const requiresFlag =
    options.requiresManualTwoFactor === undefined
      ? null
      : options.requiresManualTwoFactor
        ? 1
        : 0;

  const db = getDb();
  if (requiresFlag === null) {
    // Don't touch the flag if not specified - keep whatever was there.
    db.prepare(
      `INSERT INTO bank_credentials (workspace_id, provider, credentials_encrypted, iv, auth_tag, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(workspace_id, provider) DO UPDATE SET
         credentials_encrypted = excluded.credentials_encrypted,
         iv = excluded.iv,
         auth_tag = excluded.auth_tag,
         updated_at = excluded.updated_at`
    ).run(workspaceId, provider, encrypted, iv, authTag);
  } else {
    db.prepare(
      `INSERT INTO bank_credentials (workspace_id, provider, credentials_encrypted, iv, auth_tag, requires_manual_two_factor, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(workspace_id, provider) DO UPDATE SET
         credentials_encrypted = excluded.credentials_encrypted,
         iv = excluded.iv,
         auth_tag = excluded.auth_tag,
         requires_manual_two_factor = excluded.requires_manual_two_factor,
         updated_at = excluded.updated_at`
    ).run(workspaceId, provider, encrypted, iv, authTag, requiresFlag);
  }
}

export function getBankCredentials(
  workspaceId: number,
  provider: string
): Record<string, string> | null {
  const row = getDb()
    .prepare(
      "SELECT credentials_encrypted, iv, auth_tag FROM bank_credentials WHERE workspace_id = ? AND provider = ?"
    )
    .get(workspaceId, provider) as
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

export function getRequiresManualTwoFactor(
  workspaceId: number,
  provider: string
): boolean {
  const row = getDb()
    .prepare(
      "SELECT requires_manual_two_factor FROM bank_credentials WHERE workspace_id = ? AND provider = ?"
    )
    .get(workspaceId, provider) as
    | { requires_manual_two_factor: number }
    | undefined;
  return Boolean(row?.requires_manual_two_factor);
}

export function setRequiresManualTwoFactor(
  workspaceId: number,
  provider: string,
  value: boolean
): void {
  getDb()
    .prepare(
      `UPDATE bank_credentials SET requires_manual_two_factor = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND provider = ?`
    )
    .run(value ? 1 : 0, workspaceId, provider);
}

/**
 * Merge a single field into the encrypted credentials JSON without requiring
 * the caller to rewrite the whole blob. Used to persist OneZero's
 * long-term OTP token alongside email/password/phoneNumber.
 */
export function updateCredentialField(
  workspaceId: number,
  provider: string,
  key: string,
  value: string | null
): void {
  const existing = getBankCredentials(workspaceId, provider);
  if (!existing) return;
  const next = { ...existing };
  if (value === null) {
    delete next[key];
  } else {
    next[key] = value;
  }
  saveBankCredentials(workspaceId, provider, next);
}

export function hasBankCredentials(workspaceId: number): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM bank_credentials WHERE workspace_id = ?")
    .get(workspaceId) as { count: number };
  return row.count > 0;
}

export function deleteBankCredentials(
  workspaceId: number,
  provider: string
): void {
  getDb()
    .prepare("DELETE FROM bank_credentials WHERE workspace_id = ? AND provider = ?")
    .run(workspaceId, provider);
}

export interface BankCredentialMeta {
  provider: string;
  createdAt: string;
  updatedAt: string;
  requiresManualTwoFactor: boolean;
  hasTwoFactorToken: boolean;
}

interface ListRow {
  provider: string;
  createdAt: string;
  updatedAt: string;
  requires_manual_two_factor: number;
}

export function listBankCredentials(workspaceId: number): BankCredentialMeta[] {
  const rows = getDb()
    .prepare(
      `SELECT provider, created_at as createdAt, updated_at as updatedAt, requires_manual_two_factor
       FROM bank_credentials WHERE workspace_id = ? ORDER BY provider`
    )
    .all(workspaceId) as ListRow[];

  return rows.map((r) => {
    let hasToken = false;
    try {
      const creds = getBankCredentials(workspaceId, r.provider);
      hasToken = Boolean(creds && creds.otpLongTermToken);
    } catch {
      hasToken = false;
    }
    return {
      provider: r.provider,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      requiresManualTwoFactor: Boolean(r.requires_manual_two_factor),
      hasTwoFactorToken: hasToken,
    };
  });
}
