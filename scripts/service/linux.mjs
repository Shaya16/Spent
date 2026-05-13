import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PORT, REPO_ROOT, renderTemplate } from "./paths.mjs";
import { addManagedBlock, removeManagedBlock } from "./hosts.mjs";

const UNIT_NAME = "spent.service";
const UNIT_DIR = path.join(
  process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
  "systemd",
  "user",
);
const UNIT_PATH = path.join(UNIT_DIR, UNIT_NAME);
const LOG_DIR = path.join(
  process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state"),
  "spent",
  "log",
);

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

function writeUnit() {
  const nodePath = whichNode();
  const pathEnv = `${path.dirname(nodePath)}:/usr/local/bin:/usr/bin:/bin`;
  const content = renderTemplate("spent.service", {
    nodePath,
    repoRoot: REPO_ROOT,
    port: PORT,
    pathEnv,
    logDir: LOG_DIR,
  });
  fs.mkdirSync(UNIT_DIR, { recursive: true });
  fs.writeFileSync(UNIT_PATH, content, { mode: 0o644 });
}

function systemctl(args, opts = {}) {
  return spawnSync("systemctl", ["--user", ...args], {
    encoding: "utf-8",
    stdio: opts.stdio ?? "inherit",
  });
}

function checkPortBinding() {
  const r = spawnSync(
    "ss",
    ["-Hltn", `sport = :${PORT}`],
    { encoding: "utf-8" },
  );
  if (r.status !== 0) {
    return { listening: false };
  }
  const lines = r.stdout.split("\n").filter(Boolean);
  const onLoopback = lines.some(
    (l) => l.includes(`127.0.0.1:${PORT}`) || l.includes(`[::1]:${PORT}`),
  );
  const onWildcard = lines.some(
    (l) => l.includes(`0.0.0.0:${PORT}`) || l.includes(`*:${PORT}`),
  );
  return { listening: lines.length > 0, onLoopback, onWildcard };
}

function ensureSystemdAvailable() {
  const r = spawnSync("systemctl", ["--user", "is-system-running"], {
    encoding: "utf-8",
  });
  if (r.error || (r.status !== 0 && !r.stdout)) {
    throw new Error(
      "systemd user instance not available. " +
        "On WSL/some minimal distros, enable lingering: `loginctl enable-linger $USER`. " +
        "Or run the server manually with `npm run start`.",
    );
  }
}

function preflight() {
  if (!fs.existsSync(path.join(REPO_ROOT, ".next"))) {
    console.warn(
      "WARNING: .next/ not found. Run `npm run build` before installing the service.",
    );
  }
}

export async function run(cmd, { friendlyUrl }) {
  switch (cmd) {
    case "install": {
      preflight();
      ensureSystemdAvailable();
      ensureLogDir();
      writeUnit();
      systemctl(["daemon-reload"]);
      systemctl(["enable", "--now", UNIT_NAME]);
      try {
        addManagedBlock();
      } catch (err) {
        console.error(`Hosts file edit failed: ${err.message}`);
        console.error("Service is still installed. You can fix hosts later.");
      }
      setTimeout(() => {
        const state = checkPortBinding();
        if (state.onWildcard) {
          console.error(
            `DANGER: server is bound to wildcard address on :${PORT}. ` +
              `Stop the service immediately with: npm run service:stop`,
          );
          process.exit(1);
        }
        console.log(`Spent is running. Open ${friendlyUrl}.`);
      }, 1500);
      return;
    }
    case "uninstall": {
      systemctl(["disable", "--now", UNIT_NAME]);
      if (fs.existsSync(UNIT_PATH)) fs.unlinkSync(UNIT_PATH);
      systemctl(["daemon-reload"]);
      try {
        removeManagedBlock();
      } catch (err) {
        console.error(`Hosts file cleanup failed: ${err.message}`);
      }
      console.log("Spent service removed. The repo and data/ directory are untouched.");
      return;
    }
    case "start": {
      systemctl(["start", UNIT_NAME]);
      return;
    }
    case "stop": {
      systemctl(["stop", UNIT_NAME]);
      return;
    }
    case "status": {
      systemctl(["status", UNIT_NAME, "--no-pager"]);
      const port = checkPortBinding();
      console.log(
        `\nPort ${PORT}: ${
          port.onLoopback
            ? "127.0.0.1 (ok)"
            : port.onWildcard
              ? "WILDCARD (NOT OK)"
              : "not bound"
        }`,
      );
      return;
    }
    case "logs": {
      spawnSync("journalctl", ["--user", "-u", UNIT_NAME, "-f"], {
        stdio: "inherit",
      });
      return;
    }
    case "open": {
      spawnSync("xdg-open", [friendlyUrl], { stdio: "inherit" });
      return;
    }
  }
}
