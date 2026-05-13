@AGENTS.md

# Spent: project context

Context for future Claude Code sessions working on this codebase.

## Project context

Spent is a local-only personal finance tracker for Israeli financial institutions. It is an **open-source project** intended for users to self-host. The user is based in Israel, building this for personal use first and then publishing.

Key priorities (in order):
1. **Beautiful, comfortable UI** - this is a top concern. Don't ship anything that looks rough.
2. **Open-source friendly** - users should be able to clone, run, and customize without code edits.
3. **Security** - credentials encrypted at rest, never logged, server-only scraping.
4. **Extensibility** - architected for additional banks and AI providers from day one.

## Stack reminders

- **Next.js 16** with App Router. Server components by default. Client components only where state/interactivity is needed.
- **TypeScript strict mode** - no `any` unless justified with a comment.
- **shadcn/ui v4 + base-ui** - note this uses `base-ui` under the hood, not Radix. The `asChild` prop does NOT exist; use the `render` prop or style the primitive directly. Select `onValueChange` returns `string | null`, not `string`.
- **better-sqlite3** + **israeli-bank-scrapers** must be in `serverExternalPackages` in `next.config.ts` (native bindings can't be bundled).
- **Tailwind CSS v4** - uses the new `@theme` directive in `globals.css`, not `tailwind.config.js`.

## Conventions

- No em dashes anywhere in code, comments, docs, or commit messages.
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- Comments only where the "why" isn't obvious.
- `import "server-only"` at the top of every file in `src/server/`.

## Architecture

### Data flow

1. User completes setup wizard at `/setup` (3 steps: bank, AI, done).
2. Bank credentials stored encrypted in `bank_credentials` table.
3. AI provider config stored in `settings` table (Claude API key also encrypted).
4. User clicks "Sync Now" - SSE stream from `POST /api/sync`:
   - Calls scraper wrapper in `src/server/scrapers/`
   - Inserts transactions with count-based dedup (see `src/server/lib/dedup.ts`)
   - Calls AI provider for uncategorized transactions in batches of 50
5. Dashboard reads via `GET /api/transactions`, `GET /api/summary`, `GET /api/categories`.

### Key files

- `src/server/db/index.ts` - SQLite singleton (globalThis pattern for HMR safety, WAL mode)
- `src/server/db/migrations/001_initial.sql` - schema and seed categories
- `src/server/db/queries/transactions.ts` - dedup-on-insert logic, query/summary functions
- `src/server/lib/encryption.ts` - AES-256-GCM helpers, auto-generates key file on first use
- `src/server/lib/dedup.ts` - SHA-256 hash of stable transaction fields
- `src/server/scrapers/index.ts` - error sanitization, maps provider to CompanyTypes enum
- `src/server/ai/factory.ts` - returns ClaudeProvider, OllamaProvider, or null
- `src/server/ai/prompts.ts` - the categorization prompt (shared between Claude and Ollama)
- `src/app/api/sync/route.ts` - SSE streaming sync route
- `src/components/dashboard/dashboard.tsx` - top-level dashboard component
- `src/lib/types.ts` - all shared types + `BANK_PROVIDERS` array

### Adding a new bank

1. Add to `BANK_PROVIDERS` in `src/lib/types.ts` with credential field schema.
2. Map to `CompanyTypes` enum in `src/server/scrapers/index.ts` `PROVIDER_MAP`.
3. Set `enabled: true`. Everything else flows through.

### Adding a new AI provider

1. Implement the `AIProvider` interface from `src/server/ai/types.ts`.
2. Add to `createAIProvider()` factory in `src/server/ai/factory.ts`.
3. Add provider option to setup wizard `src/components/setup/ai-step.tsx`.
4. Add settings key handling to `src/app/api/setup/ai/route.ts`.

## Testing the app

```bash
npm run dev               # starts on 127.0.0.1:3000
```

For end-to-end testing without real credentials, call the setup API directly:

```typescript
fetch('/api/setup/bank', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: 'isracard',
    credentials: { id: 'test', card6Digits: '123456', password: 'test' }
  })
})
```

To reset state: delete `data/spent.db*` and `data/.encryption-key`.

## Known quirks

- The `israeli-bank-scrapers` library uses Puppeteer with hardcoded Asia/Jerusalem timezone.
- Some banks (Yahav) only support 6 months of history.
- Most banks except OneZero do NOT support 2FA - users must disable it on the bank side.
- The `identifier` field is not reliably unique across banks. Our dedup uses a composite hash + count, so we don't rely on it.
- `claude-haiku-4-5-20251001` is the default Claude model (cost-effective for categorization). To upgrade, change in `src/server/ai/providers/claude.ts`.

## Out of scope (for now)

- Budgets and budget alerts
- Transaction exports (CSV, OFX)
- Multi-user / auth
- Mobile app (Phase 2)
- Hebrew UI (English only for Phase 1)
- Custom categories (only predefined seeded ones for now)

## Original spec

See `~/.claude/plans/personal-finance-tracker-cozy-reef.md` for the full original design spec.
