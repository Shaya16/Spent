# Security

Spent is designed to run **only on your own machine**. The threat model
below assumes you are not deploying this as a hosted service. If you do
deploy it, almost none of the assumptions hold.

## Assets

| Asset | Location | How it's protected |
|-------|----------|--------------------|
| Bank credentials | `data/spent.db` (`bank_credentials` table) | Encrypted with AES-256-GCM |
| Claude API key | `data/spent.db` (`settings` table) | Encrypted with AES-256-GCM |
| Encryption key | `data/.encryption-key` | File permissions `0o600` (owner read-write only). **Not encrypted itself.** |
| Transaction data | `data/spent.db` (`transactions` table) | Plaintext inside the SQLite file |

## What's protected at rest

Bank credentials and the Claude API key never sit on disk in plaintext.
They're encrypted with a 32-byte random key (`data/.encryption-key`)
using AES-256-GCM with a fresh IV per write. Anyone who reads the DB
file alone cannot decrypt them.

## What's NOT protected at rest

- The encryption key file itself is plaintext (hex). Whoever can read
  `data/.encryption-key` AND `data/spent.db` can decrypt your
  credentials.
- Transaction data (merchant, amount, date, category) is plaintext in
  the SQLite file. Someone with disk access can see all your spending.

The right defense for both is **full-disk encryption on your laptop**
(FileVault on macOS, BitLocker on Windows, LUKS on Linux). Turn it on.

## Network surface

The dev server binds to `127.0.0.1` only. It is not reachable from your
local network or the internet. The library only contacts:

- Your bank's domains (e.g., `digital.isracard.co.il`) — via Puppeteer
- `api.anthropic.com` — only if Claude is your AI provider
- `localhost:11434` — only if Ollama is your AI provider
- `www.google.com` — favicon API for bank logos (only the domain
  name leaves your machine, no credentials)

Run with `mitmproxy` or Charles to verify this yourself.

## CSRF defense

Next.js middleware (`src/middleware.ts`) rejects any mutating API
request (POST/PUT/PATCH/DELETE) whose `Origin` or `Referer` header
doesn't match the app's own host. This prevents a malicious tab in
your browser from triggering syncs / category changes against your
localhost.

## Browser security headers

Configured in `next.config.ts`:

- `X-Frame-Options: DENY` — no embedding in iframes
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — camera, microphone, geolocation, payment all disabled
- `Content-Security-Policy` — restricts script/style/connect sources

## Dependency hygiene

The credential-touching libraries are pinned to exact versions in
`package.json` (no caret prefix):

- `israeli-bank-scrapers` — scrapes your bank with your password
- `better-sqlite3` — reads/writes the DB file
- `@anthropic-ai/sdk` — sends data to Claude

Run `npm run security:audit` to check for known vulnerabilities, and
`npm run security:outdated` to see if anything is out of date. Re-audit
after every upgrade.

## Threats this design accepts

| Threat | Why we accept it |
|--------|------------------|
| Local attacker with file system access | Out of scope for a local app. Use full-disk encryption. |
| Compromised laptop / malware | Out of scope. Don't run untrusted code. |
| Supply chain attack on a transitive dependency | Real, mitigated by pinning + `npm audit`. |
| Bank changes its UI and the scraper breaks | Library updates fix this; we pin so they don't auto-upgrade. |
| Bank blocks/flags automated logins | Possible. Many banks tolerate it; some don't. |
| Memory dump of the Node.js process | If you can do this you've already won. |

## What to do if you're more paranoid

In rough order of effort vs. benefit:

1. **Enable full-disk encryption** on your laptop (highest payoff)
2. **Enable login notifications** at your bank
3. **Use a unique strong password** for the bank account (not reused)
4. **Pin dependency versions** (already done for the sensitive libraries)
5. **Audit `node_modules/israeli-bank-scrapers/lib/` once** to convince
   yourself it only touches bank domains. ~300 lines per scraper.
6. **Use a separate, low-limit credit card** for daily spending and only
   track that one in Spent
7. **Run sync with `Show browser during sync` enabled** the first few
   times so you can watch Puppeteer drive the bank's actual login page
8. **Monitor outbound network traffic** with `mitmproxy` or Little Snitch
9. **Move `data/.encryption-key` into your OS keychain** (macOS Keychain,
   Windows DPAPI, Linux Secret Service). Not implemented yet — see the
   roadmap below.

## Roadmap improvements

These would meaningfully harden the app. None of them are required for
a personal local install; each adds friction in exchange for additional
defense.

- **Master password to unlock the app on startup.** Derive the
  encryption key from the password via Argon2id. Removes
  `data/.encryption-key` from disk entirely.
- **OS keychain integration** for the encryption key (macOS Keychain
  via `node-keytar`, etc.).
- **Whole-DB encryption** with SQLCipher instead of just the credential
  columns. Hides transaction data from anyone with disk access.
- **Per-credential key wrapping** (KEK/DEK pattern) so a compromised
  key only exposes one credential at a time.
- **Audit log** of every API mutation with timestamps.

## Reporting a security issue

This is a personal project. If you find a security issue, open an issue
on the repo. There is no bug bounty.
