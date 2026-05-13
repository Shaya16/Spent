# Spent

> **Warning:** Personal, local-only tool. Scraping financial institutions may violate their Terms of Service. Use only for your own accounts on your own machine. **Do not deploy as a hosted service.**

A local personal finance tracker for Israeli banks. Pulls your transactions, encrypts your credentials, and auto-categorizes with Claude or Ollama. **Binds to `127.0.0.1` only — not reachable from your LAN or the internet.**

## Requirements

- Node.js 22+
- macOS 13+, Ubuntu 22+ (with systemd), or Windows 11
- Bank account with 2FA disabled (most Israeli banks require this for automation)

## Install

```bash
git clone <this-repo> spent
cd spent
npm install
npm run build
npm run service:install
```

`service:install` registers an auto-start unit (LaunchAgent / systemd / Task Scheduler) and adds `127.0.0.1 spent.local` to your hosts file. The hosts edit is the only step that asks for `sudo` / Administrator.

Open **`http://spent.local:41234`** and bookmark it.

**macOS bonus** — install the menu bar app:
```bash
npm run menubar:install
open ~/Applications/Spent.app   # right-click → Open first time for Gatekeeper
```

## First-time setup

In the browser:

1. Connect your bank (credentials are AES-256-GCM encrypted before they touch disk)
2. Choose AI provider: Claude, Ollama, or none
3. Click "Sync Now"

## How you'll use it

| What you want | Run |
|---|---|
| Just use the app (no coding) | Open `http://spent.local:41234` |
| Code and see changes instantly | `npm run dev` → `http://127.0.0.1:3000` |
| Update the always-on app after editing | `npm run service:reload` |

Rare cases:
- Changed Swift menu bar app → `npm run menubar:install` and relaunch `Spent.app`
- Changed install scripts or hostname → `npm run service:uninstall && npm run service:install`

## Service commands

| Command | What it does |
|---|---|
| `service:status` | Running? Bound to loopback? |
| `service:start` / `service:stop` | Start/stop now |
| `service:reload` | Rebuild + restart |
| `service:logs` | Tail server logs |
| `service:open` | Open the app in your browser |
| `service:uninstall` | Remove auto-start + hosts entry. `data/` is untouched. |

## Where your data lives

- `data/spent.db` — transactions, categories, settings
- `data/.encryption-key` — AES key (mode `0600`; server refuses to start otherwise)
- `~/Library/Logs/Spent/` (macOS) / `~/.local/state/spent/log/` (Linux) — service logs

**Turn on full-disk encryption** (FileVault / BitLocker / LUKS). Full threat model in [SECURITY.md](SECURITY.md).

## Troubleshooting

- **Port 41234 in use** → `lsof -nP -iTCP:41234 -sTCP:LISTEN` (Unix) or `netstat -ano | findstr :41234` (Windows). Kill the offender, re-run install.
- **Gatekeeper blocks `Spent.app`** → right-click → Open → Open. One-time.
- **Linux: "systemd user instance not available"** → `loginctl enable-linger $USER`.
- **Windows: hosts edit fails** → re-run install from an elevated PowerShell.

## License

MIT
