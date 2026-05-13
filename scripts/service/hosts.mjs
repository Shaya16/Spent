import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { HOST, FRIENDLY_HOST } from "./paths.mjs";

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
    "# Added by Spent (scripts/service). Resolves spent.local to loopback.",
    "# Do not edit between markers; `npm run service:uninstall` removes them.",
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
      throw new Error(
        `sudo cp failed (exit ${r.status}). Hosts file not modified.`,
      );
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
      `Cannot write ${targetPath}: ${(err instanceof Error ? err.message : err)}.\n` +
        "Re-run this command from an Administrator PowerShell:\n" +
        '  Start-Process powershell -Verb RunAs -ArgumentList "-NoExit","-Command","cd \\"' +
        process.cwd() +
        '\\"; npm run service:install"',
    );
  }
}

export function addManagedBlock() {
  const { path: p, content } = readCurrent();

  if (content.includes(MARKER_START)) {
    console.log(`Hosts file already has the spent block. No changes.`);
    return false;
  }

  const block = buildManagedBlock();
  const newContent =
    content.endsWith("\n") || content === ""
      ? content + block + os.EOL
      : content + os.EOL + block + os.EOL;

  console.log(`Will append these lines to ${p}:`);
  console.log("---");
  console.log(block);
  console.log("---");

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
