import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FRIENDLY_HOST, HOST } from "./paths.mjs";

const MARKER_START = "# >>> spent (managed) >>>";
const MARKER_END = "# <<< spent <<<";
const MANAGED_LINE = `${HOST}\t${FRIENDLY_HOST}`;

export function hostsFilePath() {
  if (process.platform === "win32") {
    const sysroot = process.env.SystemRoot ?? "C:\\Windows";
    return path.join(sysroot, "System32", "drivers", "etc", "hosts");
  }
  return "/etc/hosts";
}

function buildManagedBlock() {
  return [
    MARKER_START,
    `# Added by Spent (scripts/service). Resolves ${FRIENDLY_HOST} to loopback.`,
    "# Do not edit between markers; `bun run service:uninstall` removes them.",
    MANAGED_LINE,
    MARKER_END,
  ].join(os.EOL);
}

function stripManagedBlock(content) {
  const start = content.indexOf(MARKER_START);
  if (start === -1) return content;
  const end = content.indexOf(MARKER_END);
  if (end === -1) return content;
  const after = end + MARKER_END.length;
  let trimmed = content.slice(0, start) + content.slice(after);
  trimmed = trimmed.replace(/\n{3,}/g, "\n\n");
  if (!trimmed.endsWith(os.EOL)) trimmed += os.EOL;
  return trimmed;
}

function readCurrent() {
  const p = hostsFilePath();
  if (!fs.existsSync(p)) return { path: p, content: "" };
  return { path: p, content: fs.readFileSync(p, "utf-8") };
}

export function hasManagedBlock() {
  const { content } = readCurrent();
  return content.includes(MARKER_START) && content.includes(MARKER_END);
}

function writeWithPrivilege(targetPath, newContent) {
  if (process.platform === "win32") {
    return writeWindows(targetPath, newContent);
  }
  return writeUnix(targetPath, newContent);
}

function writeUnix(targetPath, newContent) {
  const tmp = path.join(os.tmpdir(), `spent-hosts-${process.pid}.tmp`);
  fs.writeFileSync(tmp, newContent, { mode: 0o644 });
  try {
    console.log(`Updating ${targetPath} (requires sudo for this step only).`);
    const r = spawnSync("sudo", ["cp", tmp, targetPath], { stdio: "inherit" });
    if (r.status !== 0) {
      throw new Error(`sudo cp failed (exit ${r.status}). Hosts file not modified.`);
    }
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // best-effort cleanup
    }
  }
}

function writeWindows(targetPath, newContent) {
  try {
    fs.writeFileSync(targetPath, newContent);
    return;
  } catch (err) {
    throw new Error(
      `Cannot write ${targetPath}: ${err instanceof Error ? err.message : err}.\n` +
        "Re-run this command from an Administrator PowerShell:\n" +
        '  Start-Process powershell -Verb RunAs -ArgumentList "-NoExit","-Command","cd \\"' +
        process.cwd() +
        '\\"; bun run service:install"',
    );
  }
}

// Look for a managed block that points to the *previous* hostname
// (spent.local), regardless of the current FRIENDLY_HOST value. Used to
// detect legacy installs that need migration.
function hasLegacyLocalBlock(content) {
  if (!content.includes(MARKER_START)) return false;
  const start = content.indexOf(MARKER_START);
  const end = content.indexOf(MARKER_END);
  if (end === -1) return false;
  const block = content.slice(start, end + MARKER_END.length);
  return /\bspent\.local\b/.test(block) && !/\bspent\.localhost\b/.test(block);
}

function hasCurrentBlock(content) {
  if (!content.includes(MARKER_START)) return false;
  const start = content.indexOf(MARKER_START);
  const end = content.indexOf(MARKER_END);
  if (end === -1) return false;
  const block = content.slice(start, end + MARKER_END.length);
  return block.includes(MANAGED_LINE);
}

export function addManagedBlock() {
  const { path: p, content } = readCurrent();
  const isWindows = process.platform === "win32";
  const legacy = hasLegacyLocalBlock(content);

  if (!isWindows) {
    // macOS and Linux resolve *.localhost natively (macOS via the system
    // resolver, Linux via nsswitch `myhostname`). No hosts entry needed.
    // If a legacy `spent.local` block is still present, strip it so the old
    // hostname stops resolving (avoids stale bookmarks hitting a slow mDNS
    // detour or the now-wrong loopback line).
    if (!legacy && !content.includes(MARKER_START)) {
      return false;
    }
    if (legacy) {
      console.log(
        "Removing legacy spent.local hosts entry (no longer needed on this OS; *.localhost resolves natively).",
      );
    }
    const newContent = stripManagedBlock(content);
    writeWithPrivilege(p, newContent);
    return true;
  }

  // Windows: write/refresh the managed block.
  if (hasCurrentBlock(content)) {
    console.log(`Hosts file already has the spent block. No changes.`);
    return false;
  }

  const stripped = stripManagedBlock(content);
  const block = buildManagedBlock();
  const base = stripped.endsWith("\n") || stripped === "" ? stripped : stripped + os.EOL;
  const newContent = base + block + os.EOL;

  if (legacy) {
    console.log(`Migrating hosts entry from spent.local to ${FRIENDLY_HOST}.`);
  } else {
    console.log(`Will append these lines to ${p}:`);
    console.log("---");
    console.log(block);
    console.log("---");
  }

  writeWithPrivilege(p, newContent);
  return true;
}

export function removeManagedBlock() {
  const { path: p, content } = readCurrent();
  if (!content.includes(MARKER_START)) {
    console.log(`No spent block found in ${p}. Nothing to remove.`);
    return false;
  }

  const newContent = stripManagedBlock(content);
  writeWithPrivilege(p, newContent);
  return true;
}
