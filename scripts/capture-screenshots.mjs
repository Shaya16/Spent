/**
 * Capture fresh screenshots of the Spent app for the landing page.
 *
 * Requires the dev server at http://127.0.0.1:3000 to be running.
 * Writes PNGs to website/src/assets/screenshots/.
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";

const APP_URL = "http://127.0.0.1:3000";
const OUT_DIR = path.resolve(
  new URL(".", import.meta.url).pathname,
  "../website/src/assets/screenshots",
);

const VIEWPORT = { width: 1600, height: 1100, deviceScaleFactor: 2 };

const SCREENS = [
  {
    name: "home-light.png",
    path: "/",
    theme: "light",
  },
  {
    name: "dashboard-light.png",
    // Use /budget as the secondary dashboard view for peek-inside side
    path: "/budget",
    theme: "light",
  },
  {
    name: "dashboard-dark.png",
    // Home page in dark for the dark mode strip — richer than budget alone
    path: "/",
    theme: "dark",
  },
  {
    name: "transactions-light.png",
    path: "/transactions",
    theme: "light",
  },
  {
    name: "setup-bank-light.png",
    // Real connected-banks settings view, opening the Add bank picker so the
    // shot shows BOTH connected banks AND the full list of supported ones.
    path: "/settings/bank",
    theme: "light",
    afterLoad: async (page) => {
      await page.evaluate(() => {
        // Close any open dropdowns by clicking body
        document.body.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button, a"));
        const addBtn = btns.find((b) => /add bank/i.test(b.textContent || ""));
        if (addBtn) addBtn.click();
      });
      await new Promise((r) => setTimeout(r, 600));
    },
  },
];

const setTheme = async (page, theme) => {
  await page.evaluate((t) => {
    const html = document.documentElement;
    html.classList.remove("light", "dark");
    html.classList.add(t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);
};

(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: VIEWPORT,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    // Prime localStorage on the right origin
    await page.goto(APP_URL, { waitUntil: "networkidle2", timeout: 15000 });

    for (const screen of SCREENS) {
      const dest = path.join(OUT_DIR, screen.name);
      console.log(`Capturing ${screen.name} ← ${screen.path} (${screen.theme}) → ${dest}`);

      await setTheme(page, screen.theme);
      await page.goto(`${APP_URL}${screen.path}`, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });
      // Re-apply theme after navigation (in case it was reset)
      await setTheme(page, screen.theme);

      if (screen.injectCss) {
        await page.addStyleTag({ content: screen.injectCss });
      }

      // Give animations a moment to settle
      await new Promise((r) => setTimeout(r, 1200));

      if (typeof screen.afterLoad === "function") {
        await screen.afterLoad(page);
      }

      await page.screenshot({ path: dest, fullPage: false });
      console.log(`  ✓ saved`);
    }
  } finally {
    await browser.close();
  }

  console.log("\nDone. Files in:", OUT_DIR);
})().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
