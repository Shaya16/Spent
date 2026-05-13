#!/usr/bin/env node
import { assertRepoRoot, assertNotRoot, LOOPBACK_URL, URL_BASE } from "./paths.mjs";

const COMMANDS = new Set([
  "install",
  "uninstall",
  "start",
  "stop",
  "status",
  "logs",
  "open",
]);

function usage() {
  console.error(
    "usage: node scripts/service/install.mjs <install|uninstall|start|stop|status|logs|open>",
  );
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || !COMMANDS.has(cmd)) {
    usage();
    process.exit(2);
  }

  assertNotRoot();
  const pkg = assertRepoRoot();

  let impl;
  switch (process.platform) {
    case "darwin":
      impl = await import("./macos.mjs");
      break;
    case "linux":
      impl = await import("./linux.mjs");
      break;
    case "win32":
      impl = await import("./windows.mjs");
      break;
    default:
      throw new Error(
        `Unsupported platform: ${process.platform}. ` +
          `Spent's service installer supports macOS, Linux, and Windows.`,
      );
  }

  await impl.run(cmd, { pkg, loopbackUrl: LOOPBACK_URL, friendlyUrl: URL_BASE });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
