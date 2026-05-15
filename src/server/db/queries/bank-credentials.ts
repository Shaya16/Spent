import "server-only";

import { getDb } from "../index";
import { encrypt, decrypt } from "../../lib/encryption";

export function saveBankCredentials(
  workspaceId: number,
  provider: string,
  credentials: Record<string, string>
): void {
  const { encrypted, iv, authTag } = encrypt(JSON.stringify(credentials));

  getDb()
    .prepare(
      `INSERT INTO bank_credentials (workspace_id, provider, credentials_encrypted, iv, auth_tag, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(workspace_id, provider) DO UPDATE SET
         credentials_encrypted = excluded.credentials_encrypted,
         iv = excluded.iv,
         auth_tag = excluded.auth_tag,
         updated_at = excluded.updated_at`
    )
    .run(workspaceId, provider, encrypted, iv, authTag);
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
}

export function listBankCredentials(workspaceId: number): BankCredentialMeta[] {
  return getDb()
    .prepare(
      `SELECT provider, created_at as createdAt, updated_at as updatedAt
       FROM bank_credentials WHERE workspace_id = ? ORDER BY provider`
    )
    .all(workspaceId) as BankCredentialMeta[];
}
