// scripts/capture-docs-screenshots.mjs
//
// Boot Next.js against a tmp data dir seeded with fake data,
// capture docs screenshots into website/src/assets/screenshots/.
//
// Usage:
//   bun run docs:screenshots
//
// Requires a built Next app (run `bun run build` first) OR uses dev mode.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import puppeteer from "puppeteer";
import { banks, budgets, transactions } from "./docs-seed/fake-data.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const OUT_DIR = path.join(REPO_ROOT, "website/src/assets/screenshots");

const VIEWPORT = { width: 1600, height: 1100, deviceScaleFactor: 2 };
const PORT = 4399; // separate from prod 41234 and dev 3000

const SCREENS = [
  { name: "home-light.png", path: "/", theme: "light" },
  { name: "dashboard-light.png", path: "/budget", theme: "light" },
  { name: "dashboard-dark.png", path: "/", theme: "dark" },
  { name: "transactions-light.png", path: "/transactions", theme: "light" },
  { name: "settings-banks-light.png", path: "/settings/bank", theme: "light" },
  { name: "settings-ai-light.png", path: "/settings/ai", theme: "light" },
  { name: "settings-categories-light.png", path: "/settings/categories", theme: "light" },
  {
    name: "setup-bank-light.png",
    path: "/setup",
    theme: "light",
  },
];

function seedDb(dbDir) {
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "spent.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  const migrationPath = path.join(REPO_ROOT, "src/server/db/migrations/001_initial.sql");
  db.exec(fs.readFileSync(migrationPath, "utf-8"));

  // Insert banks with dummy encrypted blobs. The dashboard doesn't decrypt
  // these to render — it only shows the provider label.
  const insertBank = db.prepare(
    `INSERT INTO bank_credentials (provider, credentials_encrypted, iv, auth_tag)
     VALUES (?, ?, ?, ?)`,
  );
  for (const b of banks) {
    insertBank.run(b.provider, Buffer.from("demo"), Buffer.from("demo"), Buffer.from("demo"));
  }

  // Insert transactions. Schema in src/server/db/migrations/001_initial.sql.
  // If column list here drifts from schema, update both — the failure will be
  // immediate and noisy.
  const insertTx = db.prepare(
    `INSERT INTO transactions
      (account_number, date, processed_date, original_amount, original_currency,
       charged_amount, charged_currency, description, type, status, category_id, provider, hash)
     VALUES (@account, @date, @date, @amount, 'ILS', @amount, 'ILS', @desc, 'normal', 'completed', @cat, @provider, @hash)`,
  );
  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    insertTx.run({
      account: "****1234",
      date: t.date,
      amount: t.amount,
      desc: t.merchant,
      cat: t.cat,
      provider: t.provider,
      hash: `demo-${i.toString().padStart(4, "0")}`,
    });
  }

  // Budgets table may or may not exist depending on schema; soft-fail.
  try {
    const insertBudget = db.prepare(
      `INSERT INTO budgets (category_id, monthly_target) VALUES (?, ?)`,
    );
    for (const b of budgets) insertBudget.run(b.category_id, b.monthly_target);
  } catch {
    console.log("   (skipping budgets table — not in schema)");
  }

  db.close();
  return dbPath;
}

function startServer(dataDir) {
  const env = { ...process.env, SPENT_DATA_DIR: dataDir, PORT: String(PORT) };
  const child = spawn("npm", ["run", "dev", "--", "-p", String(PORT)], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

async function waitForServer() {
  const url = `http://127.0.0.1:${PORT}/api/health`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    const html = document.documentElement;
    html.classList.remove("light", "dark");
    html.classList.add(t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spent-docs-"));
  console.log(`Tmp data dir: ${tmpDir}`);

  console.log("Seeding fake data...");
  seedDb(tmpDir);
  console.log("  ✓ seeded");

  console.log("Starting Next.js (this can take 10-20s)...");
  const server = startServer(tmpDir);
  server.stdout.on("data", (d) => process.stdout.write(`  [next] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`  [next!] ${d}`));

  const ready = await waitForServer();
  if (!ready) {
    server.kill("SIGTERM");
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error("Next.js did not become ready in 60s");
  }
  console.log("  ✓ Next.js is ready");

  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: VIEWPORT,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle2", timeout: 30000 });

    for (const screen of SCREENS) {
      const dest = path.join(OUT_DIR, screen.name);
      console.log(`Capturing ${screen.name} ← ${screen.path} (${screen.theme})`);
      await setTheme(page, screen.theme);
      await page.goto(`http://127.0.0.1:${PORT}${screen.path}`, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
      await setTheme(page, screen.theme);
      await new Promise((r) => setTimeout(r, 1200));
      await page.screenshot({ path: dest, fullPage: false });
      console.log("  ✓ saved");
    }
  } finally {
    await browser.close();
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1000));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log("Cleaned up tmp dir");
  }
})().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
