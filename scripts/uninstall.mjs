#!/usr/bin/env node
// Mirror of setup.mjs: tear down everything `npm run setup` installed.
// The data/ directory and the repo itself are deliberately NOT touched:
// uninstall is about removing the always-on service and the menubar, not
// the user's transactions and encryption key.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const SERVICE_INSTALL = path.join(HERE, "service", "install.mjs");

function step(msg) {
  console.log(`\n=> ${msg}`);
}

function done(msg) {
  console.log(`   ${msg}`);
}

// Uninstall is best-effort: missing pieces are not errors, they're already-gone.
function tryRun(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: "ignore", ...opts });
}

function uninstallService() {
  step("Removing background service");
  const r = spawnSync(process.execPath, [SERVICE_INSTALL, "uninstall"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error(`   service uninstaller exited with status ${r.status}, continuing`);
  }
}

async function macUninstall() {
  step("Quitting Spent menubar (if running)");
  tryRun("osascript", ["-e", 'tell application "Spent" to quit']);
  // Give the GUI app a moment to flush and exit before we remove its bundle.
  await new Promise((r) => setTimeout(r, 500));
  done("done");

  step("Removing ~/Applications/Spent.app");
  const appPath = path.join(os.homedir(), "Applications", "Spent.app");
  if (fs.existsSync(appPath)) {
    fs.rmSync(appPath, { recursive: true, force: true });
    done("removed");
  } else {
    done("not present");
  }

  step("Removing Login Item");
  const r = spawnSync(
    "osascript",
    [
      "-e",
      'tell application "System Events" to delete (every login item whose name is "Spent")',
    ],
    { encoding: "utf-8" },
  );
  if (r.status === 0) {
    done("removed");
  } else {
    done("nothing to remove (or System Events refused)");
  }
}

function windowsUninstall() {
  step("Stopping Spent menubar (if running)");
  tryRun("taskkill", ["/IM", "Spent.exe", "/F"]);
  done("done");

  step("Removing %LOCALAPPDATA%\\Programs\\Spent");
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const installDir = path.join(localAppData, "Programs", "Spent");
    if (fs.existsSync(installDir)) {
      try {
        fs.rmSync(installDir, { recursive: true, force: true });
        done("removed");
      } catch (err) {
        console.error(`   could not remove: ${err.message}`);
        console.error("   close any open Spent windows and retry.");
      }
    } else {
      done("not present");
    }
  } else {
    console.error("   LOCALAPPDATA env var is not set; skipping.");
  }

  step("Removing Startup shortcut");
  const appData = process.env.APPDATA;
  if (appData) {
    const shortcutPath = path.join(
      appData,
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "Startup",
      "Spent.lnk",
    );
    if (fs.existsSync(shortcutPath)) {
      fs.unlinkSync(shortcutPath);
      done("removed");
    } else {
      done("not present");
    }
  } else {
    console.error("   APPDATA env var is not set; skipping.");
  }
}

function linuxUninstall() {
  step("Linux: no menubar to remove (web-only platform)");
}

async function main() {
  console.log("Spent uninstall");
  console.log(`  platform: ${process.platform}`);
  console.log(`  repo:     ${REPO_ROOT}`);

  uninstallService();

  switch (process.platform) {
    case "darwin":
      await macUninstall();
      break;
    case "win32":
      windowsUninstall();
      break;
    case "linux":
      linuxUninstall();
      break;
  }

  const dataDir = path.join(REPO_ROOT, "data");
  console.log("");
  console.log("Spent is uninstalled. Service and menubar are gone.");
  console.log("");
  console.log("Kept (intentionally):");
  console.log(`  ${dataDir}  (your transactions + encryption key)`);
  console.log(`  ${REPO_ROOT}  (the repo itself)`);
  console.log("");
  console.log("To wipe everything, delete those directories manually.");
}

main().catch((err) => {
  console.error(`\nuninstall: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
