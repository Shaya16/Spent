# Spent menu bar / tray app

Tiny native controller for the always-on Spent server. Shows status in the menu bar (macOS) or notification area (Windows), with one-click Open dashboard / Sync now / Start–Stop service / Quit.

Both apps poll `http://127.0.0.1:41234/api/health` every 5 seconds and dim the icon when the server is unreachable. The browser action opens `http://spent.local:41234`.

## macOS

```bash
cd menubar/mac
./build.sh
cp -R build/Spent.app ~/Applications/
```

First launch: right-click `Spent.app` → Open (one-time Gatekeeper prompt). Add to **System Settings → General → Login Items** to auto-start.

Requires Xcode Command Line Tools (`xcode-select --install`). Builds with Swift, ad-hoc signed.

## Windows

```powershell
cd menubar\windows
.\build.ps1
mkdir $env:LOCALAPPDATA\Programs\Spent
Copy-Item build\Spent.exe $env:LOCALAPPDATA\Programs\Spent\
```

First launch: SmartScreen may say "Windows protected your PC" — click **More info** → **Run anyway** (binary is unsigned).

To auto-start at login, drop a shortcut to `Spent.exe` into `shell:startup` (run from Win+R).

Requires .NET 8 SDK (`winget install Microsoft.DotNet.SDK.8`). Builds a self-contained single-file `Spent.exe` (~30 MB) with WPF + `H.NotifyIcon.Wpf`.

## What both apps assume

- The Spent server is already installed as a background service via `npm run service:install` (LaunchAgent on Mac, scheduled task on Windows).
- The service binds to `127.0.0.1:41234`. The tray apps will not connect to any other host.
- Start/Stop calls go to `launchctl bootstrap|bootout com.spent.app` (Mac) or `schtasks /Run|/End /TN Spent` (Windows).
