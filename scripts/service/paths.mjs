import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PORT = 41234;
export const HOST = "127.0.0.1";
export const FRIENDLY_HOST = "spent.local";
export const URL_BASE = `http://${FRIENDLY_HOST}:${PORT}`;
export const LOOPBACK_URL = `http://${HOST}:${PORT}`;

export const REPO_ROOT = path.resolve(here, "..", "..");
export const TEMPLATES_DIR = path.join(here, "templates");

export function assertRepoRoot() {
  const pkgPath = path.join(REPO_ROOT, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`Refusing to run: no package.json at ${pkgPath}`);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  if (pkg.name !== "spent") {
    throw new Error(
      `Refusing to run: ${pkgPath} is for "${pkg.name}", not "spent". ` +
        `This script must run from the spent repo.`,
    );
  }
  return pkg;
}

export function assertNotRoot() {
  if (process.platform === "win32") return;
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    throw new Error(
      "Refusing to run as root. Run this script as your normal user. " +
        "The hosts file edit step will prompt for sudo on its own.",
    );
  }
}

export function renderTemplate(name, vars) {
  const tpl = fs.readFileSync(path.join(TEMPLATES_DIR, name), "utf-8");
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) {
      throw new Error(`Template ${name} references unknown var: ${key}`);
    }
    return String(vars[key]);
  });
}
