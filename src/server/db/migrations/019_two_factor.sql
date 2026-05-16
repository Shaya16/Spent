-- 2FA support: per-bank flag for the manual (showBrowser) fallback path.
-- The plaintext flag lets the sync orchestrator decide whether to override
-- showBrowser for a specific provider WITHOUT decrypting the credentials.
-- The long-term OTP token for programmatic 2FA (OneZero) lives inside the
-- encrypted credentials JSON blob, not in a column.

ALTER TABLE bank_credentials
  ADD COLUMN requires_manual_two_factor INTEGER NOT NULL DEFAULT 0;
