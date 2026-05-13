import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PORT, REPO_ROOT, renderTemplate } from "./paths.mjs";
import { addManagedBlock, removeManagedBlock } from "./hosts.mjs";

const LABEL = "com.spent.app";
const PLIST_PATH = path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const LOG_DIR = path.join(os.homedir(), "Library", "Logs", "Spent");

function whichNode() {
  const r = spawnSync("which", ["node"], { encoding: "utf-8" });
  if (r.status !== 0) throw new Error("Cannot find `node` on PATH.");
  return r.stdout.trim();
}

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  try {
    fs.chmodSync(LOG_DIR, 0o700);
  } catch {
    // best-effort
  }
}

function writePlist() {
  const nodePath = whichNode();
  const pathEnv = `${path.dirname(nodePath)}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin`;
  const content = renderTemplate("com.spent.app.plist", {
    nodePath,
    repoRoot: REPO_ROOT,
    port: PORT,
    pathEnv,
    logDir: LOG_DIR,
  });
  fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });
  fs.writeFileSync(PLIST_PATH, content, { mode: 0o644 });
}

function launchctl(args, opts = {}) {
  return spawnSync("launchctl", args, {
    encoding: "utf-8",
    stdio: opts.stdio ?? "pipe",
  });
}

function bootstrap() {
  const uid = process.getuid();
  return launchctl(["bootstrap", `gui/${uid}`, PLIST_PATH], { stdio: "inherit" });
}

function bootout() {
  const uid = process.getuid();
  return launchctl(["bootout", `gui/${uid}/${LABEL}`]);
}

function kickstart() {
  const uid = process.getuid();
  return launchctl(["kickstart", "-k", `gui/${uid}/${LABEL}`]);
}

function checkPortBinding() {
  const r = spawnSync(
    "lsof",
    ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"],
    { encoding: "utf-8" },
  );
  if (r.status !== 0) return { listening: false };
  const lines = r.stdout.split("\n").filter(Boolean);
  const onLoopback = lines.some((l) => l.includes(`127.0.0.1:${PORT}`));
  const onWildcard = lines.some(
    (l) => l.includes(`*:${PORT}`) || l.includes(`0.0.0.0:${PORT}`),
  );
  return { listening: lines.length > 0, onLoopback, onWildcard };
}

function preflight() {
  if (!fs.existsSync(path.join(REPO_ROOT, ".next"))) {
    console.warn(
      "WARNING: .next/ not found. Run `npm run build` before installing the service.",
    );
  }
}

export async function run(cmd, { friendlyUrl, loopbackUrl }) {
  switch (cmd) {
    case "install": {
      preflight();
      ensureLogDir();
      writePlist();
      try {
        addManagedBlock();
      } catch (err) {
        console.error(`Hosts file edit failed: ${err.message}`);
        console.error("Service file is still installed. You can fix hosts later.");
      }
      bootstrap();

      setTimeout(() => {
        const state = checkPortBinding();
        if (state.onWildcard) {
          console.error(
            `DANGER: server is bound to wildcard address on :${PORT}. ` +
              `Inspect the plist at ${PLIST_PATH} and remove the service immediately.`,
          );
          process.exit(1);
        }
        if (state.onLoopback) {
          console.log(`Spent is running. Open ${friendlyUrl} or ${loopbackUrl}.`);
        } else {
          console.log(
            `Service installed. Check status: npm run service:status`,
          );
        }
      }, 1500);
      return;
    }
    case "uninstall": {
      bootout();
      if (fs.existsSync(PLIST_PATH)) fs.unlinkSync(PLIST_PATH);
      try {
        removeManagedBlock();
      } catch (err) {
        console.error(`Hosts file cleanup failed: ${err.message}`);
      }
      console.log("Spent service removed. The repo and data/ directory are untouched.");
      return;
    }
    case "start": {
      const r = bootstrap();
      if (r.status !== 0 && r.stderr?.includes("already loaded")) {
        kickstart();
      }
      console.log("Spent started.");
      return;
    }
    case "stop": {
      bootout();
      console.log("Spent stopped.");
      return;
    }
    case "status": {
      const r = launchctl(["print", `gui/${process.getuid()}/${LABEL}`]);
      const loaded = r.status === 0;
      const port = checkPortBinding();
      console.log(`LaunchAgent loaded: ${loaded ? "yes" : "no"}`);
      console.log(
        `Port ${PORT} bound: ${
          port.onLoopback
            ? "yes (127.0.0.1, ok)"
            : port.onWildcard
              ? "yes (wildcard, NOT OK)"
              : "no"
        }`,
      );
      console.log(`Plist: ${PLIST_PATH}`);
      console.log(`Logs:  ${LOG_DIR}/{out,err}.log`);
      return;
    }
    case "logs": {
      const errLog = path.join(LOG_DIR, "err.log");
      const outLog = path.join(LOG_DIR, "out.log");
      console.log(`tail -f ${errLog} ${outLog}`);
      spawnSync("tail", ["-f", errLog, outLog], { stdio: "inherit" });
      return;
    }
    case "open": {
      spawnSync("open", [friendlyUrl], { stdio: "inherit" });
      return;
    }
  }
}
