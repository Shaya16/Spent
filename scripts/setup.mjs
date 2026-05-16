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
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    throw new Error(`\`${cmd} ${args.join(" ")}\` exited with status ${r.status}`);
  }
}

function which(cmd) {
  const tool = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(tool, [cmd], { encoding: "utf-8" });
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).filter(Boolean)[0]?.trim() || null;
}

function preflight() {
  if (!fs.existsSync(path.join(REPO_ROOT, "node_modules", "next"))) {
    fail(
      "Dependencies not installed. Run this first:\n" +
      "  npm install\n" +
      "Then re-run `npm run setup`.",
    );
  }
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

function macSetup() {
  if (!which("swift")) {
    fail(
      "Swift not found. The menubar build needs Xcode Command Line Tools.\n" +
      "Install them and re-run `npm run setup`:\n" +
      "  xcode-select --install",
    );
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
  spawnSync("open", [FRIENDLY_URL], { stdio: "ignore" });
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

function windowsSetup() {
  const dotnet = which("dotnet");
  if (!dotnet) {
    fail(
      ".NET 8 SDK not found. The menubar build needs it.\n" +
      "Install and re-run `npm run setup`:\n" +
      "  winget install Microsoft.DotNet.SDK.8",
    );
  }
  const sdks = spawnSync(dotnet, ["--list-sdks"], { encoding: "utf-8" });
  if (sdks.status !== 0 || !/^(8|9|1\d)\./m.test(sdks.stdout || "")) {
    fail(
      ".NET 8+ SDK not found (the runtime alone is not enough).\n" +
      "Install the SDK and re-run `npm run setup`:\n" +
      "  winget install Microsoft.DotNet.SDK.8",
    );
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
  spawnSync("cmd", ["/c", "start", "", FRIENDLY_URL], { stdio: "ignore" });
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
  spawnSync("xdg-open", [FRIENDLY_URL], { stdio: "ignore" });
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
      macSetup();
      break;
    case "win32":
      windowsSetup();
      break;
    case "linux":
      linuxSetup();
      break;
    default:
      fail(`unsupported platform: ${process.platform}`);
  }

  console.log(`\nDone. Spent is at ${FRIENDLY_URL}`);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
