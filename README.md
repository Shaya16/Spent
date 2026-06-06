<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/logo_darkmode.svg">
  <img src="public/logo_lightmode.svg" alt="Spent" width="84">
</picture>

# Spent

**Local-only personal finance for Israeli bank accounts.**
Encrypted. AI-categorized. Yours.

[![Website](https://img.shields.io/badge/%F0%9F%8C%90%20Website-1F4D33?style=for-the-badge&labelColor=1F4D33)](https://shaya16.github.io/Spent/)
[![Docs](https://img.shields.io/badge/%F0%9F%93%96%20Docs-1F4D33?style=for-the-badge&labelColor=1F4D33)](https://shaya16.github.io/Spent/getting-started)
[![Install](https://img.shields.io/badge/%E2%AC%87%20Install-28C75B?style=for-the-badge&labelColor=28C75B)](https://shaya16.github.io/Spent/install/mac)

[![Next.js](https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs&logoColor=white&style=flat-square)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white&style=flat-square)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white&style=flat-square)](https://sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](#license)
[![Status: Beta](https://img.shields.io/badge/Status-Beta-blueviolet?style=flat-square)](#features)
[![CI](https://github.com/alon710/Spent/actions/workflows/ci.yml/badge.svg)](https://github.com/alon710/Spent/actions/workflows/ci.yml)

</div>

> [!WARNING]
> Personal, local-only tool. Scraping financial institutions may violate their Terms of Service. Use only for your own accounts on your own machine. **Do not deploy as a hosted service.**

<div align="center">

![Spent dashboard](public/screenshots/dashboard-light.png)

</div>

## Why Spent?

Israeli banks have terrible exports, YNAB doesn't speak ILS gracefully, and every "cloud finance" app wants you to hand over your bank password. Spent is the answer for people who'd rather just run something on their own laptop.

Your transactions get pulled directly from your bank with [`israeli-bank-scrapers`](https://github.com/eshaham/israeli-bank-scrapers), stored in a local SQLite file you can `cp` and back up like any other file, and categorized by an AI provider you choose: paid Claude, Gemini, free local Ollama, or nothing at all.

The trade-off is honest: you self-host, you trust the scraper, and you accept that banks may not love automation. In return you get a fast, beautiful, fully offline dashboard that never phones home.

## Features

<table>
<tr>
<td width="33%" valign="top">

### 🏦 Israeli bank integration
18 banks and card issuers ship enabled out of the box, from Isracard, Hapoalim, Leumi, Mizrahi, and Cal to One Zero (with programmatic SMS 2FA).

</td>
<td width="33%" valign="top">

### 🤖 AI categorization
Choose Claude (Anthropic) for best accuracy, Gemini (Google) for a generous free tier, Ollama for fully local LLMs, or skip and categorize manually.

</td>
<td width="33%" valign="top">

### 🔒 Local-only & encrypted
Credentials encrypted with AES-256-GCM. Server binds to `127.0.0.1` only — never reachable from your LAN or the internet.

</td>
</tr>
<tr>
<td valign="top">

### 📊 Budgets with pacing
Hierarchical categories, monthly targets, "ahead of pace" hero card, and per-category drilldown.

</td>
<td valign="top">

### 🌓 Light & dark theme
Polished buttercream-and-sage palette in light mode, warm charcoal in dark. System-aware by default.

</td>
<td valign="top">

### 🔒 Runs entirely on your machine
No cloud, no account, no telemetry. The server binds to loopback only and your data never leaves `data/`.

### 💬 Chat with your spending
A built-in AI chat agent at `/chat` answers questions about your transactions, budgets, and categories. Uses the same provider you picked for categorization.

</td>
</tr>
<tr>
<td valign="top">

### 🎯 Auto-detected transfers
Credit card payments and inter-account moves are recognized and excluded from spending totals.

</td>
<td valign="top">

### 📅 Multi-month history
Pull up to 3 months of transactions per sync (configurable). Most banks support 12 months total.

</td>
<td valign="top">

### 🔍 Merchant memory
Once you correct an AI categorization, Spent remembers — same merchant goes to the right category next time.

</td>
</tr>
<tr>
<td colspan="3" valign="top">

### 🌐 English & Hebrew (RTL)
Toggle between English (default) and עברית from **Settings → Appearance**. Hebrew flips the entire app to right-to-left with translated UI, bank names, predefined categories, currency, and date formatting. Powered by [`next-intl`](https://next-intl.dev/) — drop in a new `<locale>.json` under [`src/i18n/messages/`](src/i18n/messages/) to add another language.

</td>
</tr>
</table>

## Screenshots

<table>
<tr>
<td width="50%" align="center"><b>Dashboard — light</b></td>
<td width="50%" align="center"><b>Dashboard — dark</b></td>
</tr>
<tr>
<td><img src="public/screenshots/dashboard-light.png" alt="Dashboard light mode"></td>
<td><img src="public/screenshots/dashboard-dark.png" alt="Dashboard dark mode"></td>
</tr>
<tr>
<td align="center"><b>Transactions</b></td>
<td align="center"><b>Setup wizard</b></td>
</tr>
<tr>
<td><img src="public/screenshots/transactions-light.png" alt="Transactions page"></td>
<td><img src="public/screenshots/setup-bank-light.png" alt="Setup wizard bank picker"></td>
</tr>
<tr>
<td align="center"><b>Categories</b></td>
<td align="center"><b>AI provider</b></td>
</tr>
<tr>
<td><img src="public/screenshots/settings-categories-light.png" alt="Category management"></td>
<td><img src="public/screenshots/settings-ai-light.png" alt="AI provider settings"></td>
</tr>
<tr>
<td colspan="2" align="center"><b>Bank accounts</b></td>
</tr>
<tr>
<td colspan="2"><img src="public/screenshots/settings-bank-light.png" alt="Bank accounts settings"></td>
</tr>
</table>

## How it works

```mermaid
flowchart LR
    Bank["🏦 Israeli bank<br/>(Isracard, Hapoalim, Leumi,<br/>Mizrahi, Cal, One Zero, …)"]
    Scraper["Puppeteer scraper<br/>(israeli-bank-scrapers)"]
    DB[("📦 SQLite<br/>data/spent.db<br/>(WAL mode)")]
    AI{"🤖 AI provider<br/>Claude · Gemini · Ollama · None"}
    UI["🖥 Dashboard<br/>http://127.0.0.1:2412"]

    Bank -->|HTTPS<br/>credentials encrypted| Scraper
    Scraper -->|new transactions| DB
    DB -->|uncategorized batch| AI
    AI -->|category proposals| DB
    DB --> UI

    subgraph local["🔒 Your machine — 127.0.0.1 only"]
        Scraper
        DB
        UI
    end
```

Everything inside the dashed box stays on your laptop. The only outbound traffic is to your bank (for scraping) and optionally `api.anthropic.com` (if you chose Claude), Google Gemini API endpoints (if you chose Gemini), or `localhost:11434` (if you chose Ollama).

## Supported banks

| Bank | Type | Notes |
|---|---|---|
| **Isracard** | Credit card | ID + last 6 of card + password |
| **Visa Cal** | Credit card | Username + password |
| **Max** (formerly Leumi Card) | Credit card | Username + password |
| **American Express IL** | Credit card | Isracard-issued; ID + last 6 + password |
| **Bank Hapoalim** (incl. Poalim wallets) | Bank | User code + password |
| **Bank Leumi** | Bank | Username + password |
| **Mizrahi Tefahot** | Bank | Username + password |
| **Bank Discount** | Bank | ID + password + account number |
| **Mercantile Discount** | Bank | ID + password + account number |
| **First International (FIBI / Beinleumi)** | Bank | Username + password |
| **Otsar Hahayal** | Bank | FIBI subsidiary; username + password |
| **Bank Pagi** | Bank | Username + password |
| **Bank Massad** | Bank | Username + password |
| **Bank Yahav** | Bank | Username + ID + password — 6 months history only |
| **Union Bank** | Bank | Merged into Mizrahi-Tefahot; legacy access |
| **Beyahad Bishvilha** | Card | Histadrut benefits; ID + password |
| **Behatsdaa** | Card | Histadrut subsidies; ID + password |
| **One Zero** | Bank | Programmatic SMS 2FA; email + password + phone |

All of the above are wired through [`israeli-bank-scrapers`](https://github.com/eshaham/israeli-bank-scrapers) and shipped enabled. **One Zero** is the only provider with programmatic 2FA — for the others, disable 2FA on the bank side or use the `showBrowser` manual-2FA fallback.

Don't see your bank? Adding a scraper is a small wrapper around `israeli-bank-scrapers` — see [Contributing](#contributing).

## AI providers

| | **Claude** (Anthropic) | **Gemini** (Google) | **Ollama** (local) | **None** |
|---|---|---|---|---|
| Cost | ~₪0.004 per sync | Free tier available | Free | Free |
| Accuracy | Best | Strong | Good (depends on model) | Manual |
| Network | `api.anthropic.com` | Google Gemini API | `localhost:11434` | Offline |
| Setup | API key | API key from Google AI Studio + choose a model | Install Ollama + pull a model | Nothing |

Default model when Claude is selected: `claude-haiku-4-5-20251001` (cheap, fast, accurate for categorization). Gemini defaults to `gemini-3.5-flash` and lets you choose from stable text models: `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, and `gemini-2.5-pro`. For Ollama, `llama3.2:3b` is the recommended default.

You can change providers any time from **Settings → AI provider**. Existing categorizations are kept.

## Requirements

- **[Bun 1.3+](https://bun.com)** (used as the package manager and script runner)
- **Node.js 22+** (the runtime for the production server via `next start`)
- **macOS 13+**, **Ubuntu 22+**, or **Windows 11**
- A bank account with **2FA disabled** (most Israeli banks require this for automation — OneZero is the exception)

## Install

```bash
git clone https://github.com/alon710/Spent.git
cd spent
bun install
bun run build
bun start
```

`bun start` runs the production server bound to `127.0.0.1:2412` — loopback only, so it is never reachable from your LAN or the internet. Leave the process running (or wrap it in your own service manager / `tmux` / login item) for an always-on dashboard.

Open **`http://127.0.0.1:2412`** and bookmark it.

To hack on the app with hot reload instead, run `bun dev` and open `http://127.0.0.1:3000`.

## First-time setup

In the browser:

1. **Connect your bank** — credentials are AES-256-GCM encrypted before they touch disk.
2. **Choose an AI provider** — Claude (default), Gemini, Ollama, or none.
3. **Set your monthly ceiling** — total spend you want to stay under each month.
4. **Set per-category budgets** — type an amount on any category to budget it; leave blank to track without a limit.
5. **Done.** Sync starts automatically: 3 months of transactions, then AI categorization.

## How you'll use it

| What you want | Run |
|---|---|
| Just use the app | `bun start` → `http://127.0.0.1:2412` |
| Code and see changes instantly | `bun dev` → `http://127.0.0.1:3000` |
| Rebuild after editing | `bun run build` then restart `bun start` |
| Run the full CI gate locally before pushing | `bun run ci` |

## Uninstall

Spent installs nothing outside the project folder. To remove it:

- Stop the running `bun start` (or `bun dev`) process.
- `rm -rf data/` to wipe your transactions, budgets, and encryption key.
- Delete the repository to remove Spent entirely: `cd .. && rm -rf spent/`.

## Security at a glance

| Concern | Defense |
|---|---|
| Credentials at rest | AES-256-GCM, encryption key file mode `0600` (server refuses to start otherwise) |
| Network exposure | Bound to `127.0.0.1` only — not reachable from your LAN or the internet |
| Browser CSRF | Origin / Referer validation on every mutation |
| Bot detection | Chromium sandbox on by default (`SPENT_DISABLE_CHROMIUM_SANDBOX=1` to opt out) |
| Bundle integrity | `israeli-bank-scrapers`, `better-sqlite3`, and `@anthropic-ai/sdk` pinned to exact versions |
| Browser hardening | Strict CSP, `X-Frame-Options: DENY`, `Permissions-Policy` locks down camera/mic/geo/payment |

**Turn on full-disk encryption** (FileVault / BitLocker / LUKS). The encryption key file sits next to the database, so disk-level protection is your last line of defense if the laptop is lost.

Full threat model and responsible-disclosure policy → [SECURITY.md](SECURITY.md).

## Where your data lives

- `data/spent.db` — transactions, categories, budgets, settings
- `data/.encryption-key` — 32-byte AES key, mode `0600`

Back up `data/` like any other folder. To migrate to a new machine, copy `data/` over and start the app there.

## Architecture & code map

```
spent/
├── src/
│   ├── app/                  Next.js App Router (routes + API)
│   │   ├── (dashboard)/      Dashboard, transactions, settings pages
│   │   ├── api/              Sync (SSE), summary, transactions, setup
│   │   └── setup/            First-run wizard
│   ├── components/
│   │   ├── dashboard/        Hero card, category grid, budget drawer
│   │   ├── setup/            Bank, AI, target, budgets steps
│   │   └── settings/         Per-tab settings panels
│   ├── lib/                  Shared client-side types and helpers
│   └── server/
│       ├── ai/               Claude + Gemini + Ollama provider implementations
│       ├── db/               SQLite singleton, migrations, query helpers
│       ├── lib/              Encryption, dedup, transfer detection, pace
│       └── scrapers/         Wrapper around israeli-bank-scrapers
├── scripts/                  Dev utilities + the i18n / changed-file-lint CI helpers
├── website/                  Astro + Starlight docs site (auto-deploys to GitHub Pages)
├── .github/workflows/        CI gate + docs site deploy
└── data/                     SQLite + encryption key (gitignored)
```

## Troubleshooting

> The [Troubleshooting docs](https://shaya16.github.io/Spent/troubleshooting/) cover Defender, Gatekeeper, Cloudflare bot challenges, and bank-specific quirks in more depth.

- **Port 2412 in use** → `lsof -nP -iTCP:2412 -sTCP:LISTEN` (Unix) or `netstat -ano | findstr :2412` (Windows). Kill the offender and restart `bun start`.
- **Bank scrape fails with "Cloudflare"** → temporarily run with `SPENT_DISABLE_CHROMIUM_SANDBOX=1` to let Puppeteer use a real Chrome profile.

## Roadmap

- [x] Hebrew UI with full RTL layout
- [x] Visa Cal, Bank Leumi, Mizrahi, Discount, FIBI, and the rest of the `israeli-bank-scrapers` roster
- [x] One Zero with programmatic SMS 2FA
- [x] Gemini as a third AI provider
- [x] AI chat agent for asking questions about your spending
- [ ] CSV / OFX export
- [ ] Custom user-defined categories
- [ ] Mobile companion (Phase 2)
- [ ] Multiple workspaces

## Contributing

Spent is built for personal use first, open-source second. PRs welcome for:

- **New bank integrations** — add to `BANK_PROVIDERS` in [src/lib/types.ts](src/lib/types.ts), map to `CompanyTypes` in [src/server/scrapers/index.ts](src/server/scrapers/index.ts), flip `enabled: true`.
- **New AI providers** — implement the `AIProvider` interface from [src/server/ai/types.ts](src/server/ai/types.ts), register in [src/server/ai/factory.ts](src/server/ai/factory.ts), and add an option to the setup wizard.
- **New languages** — add `<locale>.json` under [src/i18n/messages/](src/i18n/messages/), mirroring the keys in `en.json`, and append the locale to [src/i18n/routing.ts](src/i18n/routing.ts). Toggle wires itself up automatically.
- **UI polish, bug fixes, documentation.**

Conventions:

- TypeScript strict mode. No `any` without a comment.
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- Comments only where the "why" isn't obvious. No em dashes in code, commits, or docs.
- Run `bun run ci` before opening a PR — same five checks GitHub Actions enforces strictly: formatter (Biome), TypeScript, i18n keys (next-intl-recommended `@lingual/i18n-check`), dead code (knip), React Compiler healthcheck, and `bun test`.

## License

MIT

## Acknowledgments

Built on the shoulders of:

- [`israeli-bank-scrapers`](https://github.com/eshaham/israeli-bank-scrapers) — the heart of every bank integration
- [Next.js 16](https://nextjs.org/) and [React 19](https://react.dev/)
- [`shadcn/ui`](https://ui.shadcn.com/) on top of [`base-ui`](https://base-ui.com/)
- [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
- [`next-intl`](https://next-intl.dev/) for English / Hebrew i18n
- [Anthropic Claude](https://www.anthropic.com/), [Google Gemini](https://ai.google.dev/), and the local-LLM crew at [Ollama](https://ollama.com/)
