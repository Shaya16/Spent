#!/usr/bin/env node
// One-shot setup: build Next, install the always-on service, build + install
// the platform menubar, register login auto-start, open the dashboard.
//
// Platform paths:
//   macOS   -> Spent.app installed to ~/Applications, registered as Login Item
//   Windows -> Spent.exe installed to %LOCALAPPDATA%\Programs\Spent, .lnk in Startup
//   Linux   -> service only (no native tray)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const SERVICE_INSTALL = path.join(HERE, "service", "install.mjs");
const FRIENDLY_URL = "http://spent.local:41234";
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function step(msg) {
  console.log(`\n=> ${msg}`);
}

function done(msg) {
  console.log(`   ${msg}`);
}

function fail(msg) {
  console.error(`\nsetup: ${msg}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  // Node v20.12.2+ rejects direct spawning of .cmd/.bat on Windows with EINVAL
  // (CVE-2024-27980 mitigation). Use shell:true for those; args here are
  // hardcoded so the usual injection risk does not apply.
  const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(cmd);
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: needsShell,
    ...opts,
  });
  if (r.error) {
    throw new Error(
      `\`${cmd} ${args.join(" ")}\` failed to launch: ${r.error.message}`,
    );
  }
  if (r.status !== 0) {
    const sig = r.signal ? ` (signal: ${r.signal})` : "";
    throw new Error(`\`${cmd} ${args.join(" ")}\` exited with status ${r.status}${sig}`);
  }
}

function which(cmd) {
  const tool = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(tool, [cmd], { encoding: "utf-8" });
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).filter(Boolean)[0]?.trim() || null;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Prompt for yes/no. Non-TTY (CI, piped stdin) falls back to the default
// so we don't hang. Empty input takes the default. Anything starting with
// y is yes.
async function askYesNo(question, defaultYes = true) {
  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
  if (!process.stdin.isTTY) {
    console.log(question + suffix + (defaultYes ? "y (non-interactive)" : "n (non-interactive)"));
    return defaultYes;
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question + suffix, (answer) => {
      rl.close();
      const trimmed = (answer ?? "").trim().toLowerCase();
      if (!trimmed) return resolve(defaultYes);
      resolve(trimmed === "y" || trimmed === "yes");
    });
  });
}

async function ensureMacPrereq() {
  if (which("swift")) return true;

  console.log("");
  console.log("Xcode Command Line Tools are required to build the macOS menubar.");
  console.log("Size: about 1 GB. Time: 5-15 minutes.");
  console.log("Will run: xcode-select --install (opens a system dialog)");
  console.log("");

  const yes = await askYesNo("Install now?");
  if (!yes) return false;

  step("Installing Xcode Command Line Tools");
  console.log("   A system dialog will appear. Click 'Install' and accept the license.");
  // xcode-select --install returns immediately after dispatching the dialog,
  // so we have to poll for swift becoming available.
  spawnSync("xcode-select", ["--install"], { stdio: "inherit" });

  console.log("");
  step("Waiting for install to finish (this can take 5-15 minutes)");
  const start = Date.now();
  const timeoutMs = 30 * 60 * 1000;
  let lastMin = -1;
  while (Date.now() - start < timeoutMs) {
    if (which("swift")) {
      done("Xcode Command Line Tools are ready");
      return true;
    }
    await sleep(10 * 1000);
    const min = Math.floor((Date.now() - start) / 60000);
    if (min !== lastMin && min > 0) {
      console.log(`   still waiting (${min} min elapsed)...`);
      lastMin = min;
    }
  }
  console.error("   timed out after 30 minutes. Re-run `npm run setup` after install completes.");
  return false;
}

function hasDotnet8Sdk(dotnetPath) {
  const r = spawnSync(dotnetPath, ["--list-sdks"], { encoding: "utf-8" });
  return r.status === 0 && /^(8|9|1\d)\./m.test(r.stdout || "");
}

async function ensureWindowsPrereq() {
  const dotnet = which("dotnet");
  if (dotnet && hasDotnet8Sdk(dotnet)) return true;

  console.log("");
  console.log(".NET 8 SDK is required to build the Windows menubar.");
  console.log("Size: about 200 MB. Time: 2-5 minutes.");

  if (!which("winget")) {
    console.log("");
    console.error("winget is not available on this machine. Install .NET 8 SDK manually:");
    console.error("  https://dotnet.microsoft.com/download/dotnet/8.0");
    console.error("Then re-run `npm run setup`.");
    return false;
  }

  console.log("Will run: winget install Microsoft.DotNet.SDK.8");
  console.log("");

  const yes = await askYesNo("Install now?");
  if (!yes) return false;

  step("Installing .NET 8 SDK via winget");
  const r = spawnSync(
    "winget",
    [
      "install",
      "Microsoft.DotNet.SDK.8",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "-e",
    ],
    { stdio: "inherit", shell: true },
  );
  if (r.status !== 0) {
    console.error("   winget exited with non-zero status. Check the output above.");
    return false;
  }

  // winget refreshes PATH for new shells, not the current one. Re-query in
  // case it landed in a directory our process already knows about; otherwise
  // tell the user to reopen the terminal.
  const dotnet2 = which("dotnet");
  if (dotnet2 && hasDotnet8Sdk(dotnet2)) {
    done(".NET 8 SDK is ready");
    return true;
  }
  console.error("   .NET 8 SDK installed, but `dotnet` is not yet on PATH for this shell.");
  console.error("   Close and reopen your terminal, then re-run `npm run setup`.");
  return false;
}

function preflight() {
  if (!fs.existsSync(path.join(REPO_ROOT, "node_modules", "next"))) {
    fail(
      "Dependencies not installed. Run this first:\n" +
      "  npm install\n" +
      "Then re-run `npm run setup`.",
    );
  }

  if (process.platform === "win32") {
    // Hosts file edit needs Administrator on Windows, but setup itself does
    // not. If the shell is not elevated, warn (so the user knows why
    // spent.local won't resolve later) and keep going. The web app at
    // 127.0.0.1 works regardless.
    const r = spawnSync("net", ["session"], { encoding: "utf-8" });
    if (r.status !== 0) {
      console.log("");
      console.log("Note: this shell is not Administrator.");
      console.log("Setup will continue, but the hosts entry for spent.local cannot be added.");
      console.log("  - http://127.0.0.1:41234 will work normally.");
      console.log("  - http://spent.local:41234 will not resolve.");
      console.log("To enable the friendly hostname later, relaunch from an elevated");
      console.log("PowerShell (Win+X -> 'Terminal (Admin)') and run `npm run service:install`.");
      console.log("");
    }
  }
}

function hostsHasSpentLocal() {
  const hostsPath = process.platform === "win32"
    ? `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\drivers\\etc\\hosts`
    : "/etc/hosts";
  try {
    const content = fs.readFileSync(hostsPath, "utf-8");
    return /^[^#\n]*\b127\.0\.0\.1\b[^\n]*\bspent\.local\b/m.test(content);
  } catch {
    return false;
  }
}

function dashboardUrl() {
  return hostsHasSpentLocal() ? FRIENDLY_URL : "http://127.0.0.1:41234";
}

function buildNextApp() {
  step("Building Next.js app");
  run(NPM, ["run", "build"], { cwd: REPO_ROOT });
}

function installService() {
  step("Installing background service");
  run(process.execPath, [SERVICE_INSTALL, "install"], { cwd: REPO_ROOT });
}

// launchctl/schtasks/systemctl all return as soon as the job is registered,
// not when `next start` is actually listening. Poll /api/health so the
// browser-open at the end of setup doesn't beat the server to the punch.
async function waitForServer(maxMs = 60000) {
  const url = "http://127.0.0.1:41234/api/health";
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        if (data && data.ok === true) return true;
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  if (lastErr) {
    console.error(`   last error while polling: ${lastErr.message ?? lastErr}`);
  }
  return false;
}

async function macSetup() {
  const ok = await ensureMacPrereq();
  if (!ok) {
    step("Skipping menubar");
    console.log(`   Web app is installed and running at ${dashboardUrl()}`);
    console.log("   Install Xcode Command Line Tools and re-run `npm run setup` to add the menubar.");
    return;
  }

  step("Building Spent.app");
  run("bash", [path.join(REPO_ROOT, "menubar", "mac", "build.sh")]);

  step("Installing Spent.app to ~/Applications");
  const appsDir = path.join(os.homedir(), "Applications");
  fs.mkdirSync(appsDir, { recursive: true });
  const target = path.join(appsDir, "Spent.app");
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  run("cp", ["-R", path.join(REPO_ROOT, "menubar", "mac", "build", "Spent.app"), target]);
  done(target);

  step("Registering Login Item");
  addLoginItemMac(target);

  step("Launching menubar");
  spawnSync("open", [target], { stdio: "ignore" });

  step("Opening dashboard");
  spawnSync("open", [dashboardUrl()], { stdio: "ignore" });
}

function addLoginItemMac(appPath) {
  const check = spawnSync(
    "osascript",
    ["-e", 'tell application "System Events" to get the name of every login item'],
    { encoding: "utf-8" },
  );
  if (check.status === 0 && /(^|, )Spent($|,)/.test(check.stdout.trim())) {
    done("already registered");
    return;
  }

  const escapedPath = appPath.replace(/"/g, '\\"');
  const r = spawnSync(
    "osascript",
    [
      "-e",
      `tell application "System Events" to make login item at end with properties {path:"${escapedPath}", hidden:true}`,
    ],
    { encoding: "utf-8" },
  );
  if (r.status === 0) {
    done("added");
  } else {
    console.error(`   could not add login item: ${r.stderr?.trim() || "unknown error"}`);
    console.error("   add manually: System Settings -> General -> Login Items -> +");
  }
}

async function windowsSetup() {
  const ok = await ensureWindowsPrereq();
  if (!ok) {
    step("Skipping menubar");
    console.log(`   Web app is installed and running at ${dashboardUrl()}`);
    console.log("   Install .NET 8 SDK and re-run `npm run setup` to add the menubar.");
    return;
  }

  step("Building Spent.exe");
  run("powershell", [
    "-ExecutionPolicy", "Bypass",
    "-File", path.join(REPO_ROOT, "menubar", "windows", "build.ps1"),
  ]);

  step("Installing Spent.exe to %LOCALAPPDATA%\\Programs\\Spent");
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) fail("LOCALAPPDATA env var is not set.");
  const installDir = path.join(localAppData, "Programs", "Spent");
  fs.mkdirSync(installDir, { recursive: true });
  const targetExe = path.join(installDir, "Spent.exe");
  const builtExe = path.join(REPO_ROOT, "menubar", "windows", "build", "Spent.exe");
  fs.copyFileSync(builtExe, targetExe);
  done(targetExe);

  step("Adding Startup shortcut");
  addStartupShortcutWindows(targetExe);

  step("Launching menubar");
  spawnSync("powershell", ["-Command", `Start-Process "${targetExe}"`], { stdio: "ignore" });

  step("Opening dashboard");
  spawnSync("cmd", ["/c", "start", "", dashboardUrl()], { stdio: "ignore" });
}

function addStartupShortcutWindows(exePath) {
  const appData = process.env.APPDATA;
  if (!appData) {
    console.error("   APPDATA env var is not set; skipping Startup shortcut.");
    return;
  }
  const startupDir = path.join(
    appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup",
  );
  fs.mkdirSync(startupDir, { recursive: true });
  const shortcutPath = path.join(startupDir, "Spent.lnk");
  if (fs.existsSync(shortcutPath)) {
    done("already present");
    return;
  }

  const ps =
    `$ws = New-Object -ComObject WScript.Shell; ` +
    `$sc = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}'); ` +
    `$sc.TargetPath = '${exePath.replace(/'/g, "''")}'; ` +
    `$sc.Save()`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf-8" });
  if (r.status === 0) {
    done("added");
  } else {
    console.error(`   could not create startup shortcut: ${r.stderr?.trim() || "unknown error"}`);
  }
}

function linuxSetup() {
  step("Linux: no native tray");
  console.log("   Spent on Linux is web-only. The service is installed and");
  console.log("   running. Control it with the npm scripts:");
  console.log("     npm run service:status / :start / :stop / :reload / :logs");

  step("Opening dashboard");
  spawnSync("xdg-open", [dashboardUrl()], { stdio: "ignore" });
}

async function main() {
  console.log("Spent setup");
  console.log(`  platform: ${process.platform}`);
  console.log(`  repo:     ${REPO_ROOT}`);

  preflight();
  buildNextApp();
  installService();

  step("Waiting for server to come up");
  const ready = await waitForServer();
  if (ready) {
    done("server is healthy");
  } else {
    console.error("   server did not respond within 60s, continuing anyway.");
    console.error(`   check logs: npm run service:logs`);
  }

  switch (process.platform) {
    case "darwin":
      await macSetup();
      break;
    case "win32":
      await windowsSetup();
      break;
    case "linux":
      linuxSetup();
      break;
    default:
      fail(`unsupported platform: ${process.platform}`);
  }

  printCheatSheet();
}

function printCheatSheet() {
  const url = dashboardUrl();
  console.log("");
  console.log("================================================================");
  console.log(`  Done. Spent is at ${url}`);
  if (url !== FRIENDLY_URL) {
    console.log(`  (${FRIENDLY_URL} would also work once the hosts entry is in place.)`);
  }
  console.log("================================================================");
  console.log("");
  console.log("Useful commands:");
  console.log("  npm run service:status         see if the service is running");
  console.log("  npm run service:start          start the background service");
  console.log("  npm run service:stop           stop the background service");
  console.log("  npm run service:reload         rebuild and restart (after code edits)");
  console.log("  npm run service:logs           tail the server logs");
  console.log("  npm run service:open           open the dashboard in your browser");
  console.log("  npm run uninstall              remove the service and menubar");
  console.log("");
  console.log("Tip: bookmark the URL above so the daily flow is one click.");
  console.log("");
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
