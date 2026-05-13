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

## Chromium sandbox

The scraper launches Chromium via Puppeteer. By default we leave Chromium's
renderer sandbox **on** — if a compromised bank page or a chained Chromium
CVE ever triggers RCE in the renderer, the sandbox contains it instead of
giving an attacker the same OS-user privileges as the Spent process.

The sandbox works out of the box on macOS, Windows, and most Linux installs.
It fails to start in two scenarios:

- Running as root on Linux
- Running inside a Docker container without the kernel capabilities the
  Chromium sandbox needs (most off-the-shelf images)

In those cases set `SPENT_DISABLE_CHROMIUM_SANDBOX=1` in your environment.
Prefer running as a non-root user instead when you can — that keeps the
sandbox on.

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

## Always-on service

If you install Spent as a background service (`npm run service:install`),
the server runs from login to logout (or from boot to shutdown). This
changes how some surfaces look. The guarantees:

**The server still binds only to `127.0.0.1`.** The `npm run start`
script hardcodes `-H 127.0.0.1 -p 41234`, and every per-OS template
(LaunchAgent plist, systemd unit, Task Scheduler XML) invokes it with
those flags. The installer runs a post-install check and refuses to
finish if it detects the server listening on a non-loopback address.

**No new daemon runs as root or SYSTEM.** The installer refuses to run
as root. The LaunchAgent and systemd user unit run under your user.
The Windows scheduled task uses `LeastPrivilege` and runs as the
installing user, not as `SYSTEM`.

**The hostname is loopback-only.** `npm run service:install` appends
`127.0.0.1 spent.local` to your OS hosts file (the only step that
requires elevation, and it prompts interactively). The block is
bracketed with markers and removed cleanly by `npm run service:uninstall`.
No mDNS / Bonjour service is ever registered, so `spent.local` does
not resolve from any other device on your network.

**The health endpoint discloses minimum information.** `GET /api/health`
returns `{ok, version, hasDb}` and nothing else. No transaction counts,
no provider names, no setup status. Add to it only if you have thought
carefully about what a local cross-app attacker could learn.

**The macOS menu bar app has no network entitlements beyond loopback.**
`Spent.app` ships with an `NSAppTransportSecurity > NSExceptionDomains`
entry whitelisting `127.0.0.1` and nothing else. It cannot reach the
internet even if its code were modified to try, without re-signing the
bundle with a different Info.plist.

**Logs do not leak credentials.** macOS LaunchAgent stdout/stderr go to
`~/Library/Logs/Spent/{out,err}.log` (directory mode `0700`). Linux
systemd writes to `~/.local/state/spent/log/`. The app itself already
avoids logging credentials (see "What's protected at rest" above);
the always-on service does not change that.

**The encryption key file's permissions are now asserted at startup.**
`src/server/lib/encryption.ts` reads `data/.encryption-key` and refuses
to start if the file mode is not `0600` (POSIX only; Windows relies on
the user profile ACL). If you ever `chmod 644` the key file by accident,
the server will fail loudly with the fix command.

**What the always-on service does not protect against:**

- A local attacker who can already run code as your user. They can read
  the DB and key file with or without the service running.
- A malicious browser tab on your machine doing a CSRF against
  `127.0.0.1:41234`. The same-origin middleware in
  `src/middleware.ts` already blocks this on every mutating request,
  and that protection works the same whether the server runs on demand
  or always-on.

## Reporting a security issue

This is a personal project. If you find a security issue, open an issue
on the repo. There is no bug bounty.
