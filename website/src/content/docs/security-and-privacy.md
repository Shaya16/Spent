---
title: Security & privacy
description: The full story on how Spent handles your bank credentials, transaction data, and AI queries.
---

Spent is built to be the kind of finance app you'd actually trust with your own bank password. That means a clear story on where data lives, who can read it, and what happens when something goes wrong. This page is that story.

## What Spent stores, and where

Everything Spent saves lives inside the `data/` folder of your install directory. There are two files:

- **`data/spent.db`** - a SQLite database with your encrypted bank credentials, your transactions, your categories, and your settings.
- **`data/.encryption-key`** - a 32-byte random key generated on first run.

Both files are local. Spent never uploads them anywhere. There is no "Spent cloud."

## How credentials are encrypted

Bank passwords (and your Claude API key, if you use one) are encrypted with **AES-256-GCM** before being written to the database. The 32-byte key in `data/.encryption-key` is the one used to encrypt and decrypt.

This means: if someone copies just `data/spent.db` off your computer, they cannot read your passwords. They'd also need `data/.encryption-key` *and* knowledge of how to decrypt it.

It also means: **if you delete `data/.encryption-key`, your saved credentials are unrecoverable.** Spent generates a fresh key, and the next sync will fail until you re-enter passwords.

For backups: copy both files together, treat the encryption key like a password.

## What goes over the network

Three kinds of network traffic happen when Spent syncs:

1. **Bank logins** - Spent opens a headless Chromium browser and logs into your bank's website using the credentials you provided. This traffic goes directly between your computer and your bank.
2. **AI categorization** - if you chose Claude, the *merchant name and amount* of each new transaction are sent to Anthropic's API in batches of 50. Your bank credentials are never sent. If you chose Ollama, this traffic stays on your machine.
3. **No analytics, no telemetry, no crash reports.** Spent does not phone home. Ever.

## The threat model

Spent protects against:

- **A casual attacker who reads your database file.** They cannot decrypt your bank passwords without the separate encryption key.
- **An attacker who reads only the encryption key.** They cannot do anything without the database.
- **Network eavesdroppers.** All bank logins use HTTPS; Anthropic's API is HTTPS. No bank credentials are ever sent to any AI provider.

Spent does **not** protect against:

- **An attacker with full control of your computer.** If your machine is compromised, your data is compromised. This is true of every local app.
- **A malicious npm package.** Spent depends on a number of open-source libraries. We audit `israeli-bank-scrapers` (the scraping library) but cannot independently audit every transitive dependency. If you're a security professional and want to help, please do.

## The bank-side risk

Logging into your bank's website with an automation tool is **not the same** as using the official app. Banks may, in principle:

- Lock your account temporarily if their fraud detection sees something unusual.
- Terminate your relationship with them if they consider it a breach of their terms.

In practice, this is rare for read-only scraping that happens infrequently. But it's a real risk and you should know about it. Read the [Disclaimer](/Spent/disclaimer) for the full version.

## Reporting a vulnerability

If you find a security issue, please **don't** open a public issue. Instead, email the maintainer (address in `SECURITY.md` in the repo). We'll respond within 72 hours.

For non-security bugs, [GitHub Issues](https://github.com/Shaya16/Spent/issues) is the right place.

## Auditing the code yourself

Spent is open source. The encryption code is in `src/server/lib/encryption.ts`. The bank scraping wraps the open-source [`israeli-bank-scrapers`](https://github.com/eshaham/israeli-bank-scrapers) library, which has its own audit history. The AI prompts are in `src/server/ai/prompts.ts` if you want to see exactly what is sent.

You are encouraged to read it, and to fork it.
