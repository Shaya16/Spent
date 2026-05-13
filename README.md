# Spent

> **Warning:** This is a personal, local-only tool. Scraping financial institutions may violate their Terms of Service. Use only for your own accounts on your own machine. **Do not deploy this as a hosted service for other users.**

A local-first personal finance tracker for Israeli financial institutions. Pulls your transactions from your bank or credit card, stores them in a local SQLite database, and auto-categorizes them using AI (Claude API or Ollama). Everything runs on your machine.

## Features

- **Bank integration** for Isracard (more coming: Cal, Max, Hapoalim, Leumi)
- **AI auto-categorization** with two options:
  - **Claude API** (Anthropic) for fast, accurate categorization
  - **Ollama** for fully local, private AI processing
  - Or skip AI entirely and categorize manually
- **Encrypted credential storage** (AES-256-GCM, key stored locally outside the database)
- **Beautiful dashboard** with monthly trends, category breakdowns, top merchants, and a sortable transactions table
- **System theme** that follows your OS dark/light preference
- **Idempotent sync** - re-running sync never creates duplicates

## Quick Start

### Requirements

- Node.js 22 or higher
- macOS, Linux, or Windows (WSL recommended on Windows)
- For Claude AI: an Anthropic API key
- For Ollama AI: [Ollama](https://ollama.com) installed and running locally

### Install and run

```bash
git clone <this-repo> spent
cd spent
npm install
npm run dev
```

Open http://127.0.0.1:3000 - the setup wizard will walk you through:

1. **Connect your bank** - select your provider and enter credentials. Credentials are encrypted and never leave your machine.
2. **Choose AI provider** - Claude API key, Ollama local URL, or skip.
3. **Done** - click "Sync Now" on the dashboard to pull your transactions.

## Security

- Bank credentials and the Claude API key are encrypted at rest using AES-256-GCM. The encryption key is generated on first run and stored in `data/.encryption-key` (gitignored).
- The dev server binds to `127.0.0.1` only - never `0.0.0.0`. Your data is never exposed over the network.
- All scraper code is server-side only (`src/server/`). Browser bundles never see your credentials.
- Errors are sanitized before being shown - credentials are never logged or leaked through error stacks.
- `data/` (containing your SQLite database and encryption key) is gitignored.

## Architecture

```
src/
  app/                  -- Next.js App Router (pages and API routes)
  server/               -- Server-only code (database, scrapers, AI providers)
    db/                 -- SQLite via better-sqlite3, with numbered migrations
    scrapers/           -- Wraps israeli-bank-scrapers with error sanitization
    ai/                 -- Pluggable AI provider interface (Claude, Ollama)
    lib/                -- Encryption, dedup hashing
  components/           -- React components (UI primitives, charts, dashboard)
  lib/                  -- Client-safe utilities (formatters, types, API helpers)
data/                   -- SQLite database and encryption key (gitignored)
```

### Deduplication strategy

Not every Israeli bank provides a unique identifier for each transaction. Spent uses a count-based deduplication approach:

- Each transaction gets a SHA-256 hash computed from stable fields (account, date, amount, currency, description, identifier, installment info).
- Multiple transactions with the same hash get sequential `dedup_sequence` values (0, 1, 2...). The unique constraint is `(dedup_hash, dedup_sequence)`.
- On re-sync, transactions with identical hashes are matched in batch order. New duplicates get new sequence numbers; existing ones are skipped.
- Pending transactions are upgraded to completed via `INSERT ... ON CONFLICT DO UPDATE`.

This means two genuinely identical transactions (e.g., two coffees at the same place on the same day with no identifier) are preserved as separate rows, while re-syncs remain idempotent.

### Adding more bank providers

Provider definitions live in `src/lib/types.ts` under `BANK_PROVIDERS`. To enable a new bank:

1. Add it to the `BANK_PROVIDERS` array with the correct credential field schema.
2. Map it to the right `CompanyTypes` enum value in `src/server/scrapers/index.ts`.
3. Set `enabled: true` on the provider entry.

The setup wizard, sync flow, and dashboard all handle additional providers automatically.

## Tech Stack

- **Next.js 16** with App Router and Turbopack
- **TypeScript** (strict mode)
- **SQLite** via better-sqlite3 (WAL mode)
- **Tailwind CSS v4** + **shadcn/ui** for UI primitives
- **TanStack Query** for client data fetching
- **Recharts** for charts
- **israeli-bank-scrapers** for Puppeteer-based bank scraping
- **@anthropic-ai/sdk** for Claude AI categorization
- **Ollama REST API** for local AI categorization

## License

MIT
