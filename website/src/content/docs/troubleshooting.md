---
title: Troubleshooting
description: Common problems and how to solve them.
---

If something isn't working, this page is the first place to look. The solutions are grouped by where the problem shows up.

## During install

### `npm install` fails on Windows with "MSB8020" or similar

This means the Visual Studio Build Tools didn't install correctly. Re-run the Build Tools installer, confirm **Desktop development with C++** is checked, and try `npm install` again. If it still fails, restart your computer first - sometimes the build tools don't register on PATH until you do.

### "node is not recognized as an internal or external command"

Node.js isn't on your PATH. Close the terminal, open a new one, and try again. If it still happens, re-run the Node.js installer and accept the default options - one of them adds Node to PATH.

### Permission errors during `npm install` on Mac

If you see lots of `EACCES` messages, you probably installed Node as root. Reinstall Node via [nvm](https://github.com/nvm-sh/nvm) instead, which puts it in your home directory.

### "Spent.app is from an unidentified developer"

macOS Gatekeeper warning. Right-click `Spent.app` in `~/Applications`, choose *Open*, and click *Open* again in the dialog. After the first launch, double-click works normally.

### Windows Defender flags the tray app

Click *More info → Run anyway*. The binary is built from the source code in `menubar/windows/` - you can verify it for yourself before running.

## During sync

### "Login failed - check credentials"

The most common reasons:

- You changed your bank password recently. Update it in *Settings → Banks*.
- Your bank requires 2FA, which Spent can't do (except for One Zero). Disable 2FA on the bank's side.
- The bank's website is down. Try again in an hour.

### Sync hangs or times out

The bank's website is being slow. Spent waits up to **5 minutes** for a login to complete. If it consistently times out, increase the timeout in *Settings → Advanced* or try syncing at a different time of day.

### "Connection refused" when calling Ollama

Ollama isn't running. Open a terminal and run `ollama serve`, then try the sync again. On macOS, Ollama usually starts automatically; on Windows, you may need to launch it from the Start menu.

### Anthropic API returns 401

Your Claude API key is invalid or revoked. Generate a new one at `console.anthropic.com`, paste it into *Settings → AI*, and re-sync.

## With the dashboard

### "Cannot connect to localhost:41234"

The background service isn't running. From a terminal in the Spent folder:

```sh
npm run service:status
```

If it says *stopped*, start it:

```sh
npm run service:start
```

### Transactions are missing

Some banks (Yahav in particular) only expose **6 months** of history through the website Spent scrapes. If you need older data, you'll need to enter it manually or wait for Spent to accumulate the history over time.

### Dashboard looks broken after an update

Clear your browser cache for `localhost:41234`. The dashboard's assets are cached aggressively.

## With data

### "Where is my data?"

In `data/spent.db` (a SQLite file) plus `data/.encryption-key`. Both live inside your Spent install folder.

### How do I delete all my data?

Stop the service, then delete the `data/` folder:

```sh
npm run service:stop
rm -rf data/
```

The next time the service starts, Spent creates a fresh empty database.

### How do I move Spent to a new computer?

1. Install Spent on the new computer (steps 1-6 of the install guide).
2. Before the first run, copy `data/spent.db` *and* `data/.encryption-key` from the old computer to the new computer's Spent folder.
3. Start the service. Spent picks up where it left off.

## Still stuck?

Open an issue on [GitHub](https://github.com/Shaya16/Spent/issues) with:

- Your operating system and version
- What you were doing when it broke
- The relevant error message (copy-pasted, not screenshotted)
- The output of `npm run service:logs`
