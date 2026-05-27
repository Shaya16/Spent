/**
 * Walk the redesigned landing page section by section and snapshot each.
 * Requires the Astro dev server at http://localhost:4321/Spent to be running.
 */

import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";

const LANDING_URL = "http://localhost:4321/Spent/";
const OUT_DIR = path.resolve(new URL(".", import.meta.url).pathname, "../tmp-landing-shots");

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 };

// Sections in the order they appear on the page
const SECTION_SELECTORS = [
  { name: "01-hero", selector: ".hero" },
  { name: "01b-disclaimer", selector: ".disclaimer-band" },
  { name: "02-oss", selector: ".oss" },
  { name: "03-how", selector: ".how" },
  { name: "04-promises", selector: ".promises" },
  { name: "05-peek", selector: ".peek" },
  { name: "06-setup", selector: ".setup" },
  { name: "07-dark", selector: ".dark" },
  { name: "07b-bilingual", selector: ".bilingual" },
  { name: "08-features", selector: ".features" },
  { name: "09-banks", selector: ".banks" },
  { name: "10-install-cta", selector: ".install-cta" },
  { name: "11-footer", selector: ".footer" },
];

const waitForImages = async (page) => {
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll("img"));
    // Force any lazy images to load
    imgs.forEach((img) => {
      img.loading = "eager";
    });
    await Promise.all(
      imgs.map((img) => {
        if (img.complete && img.naturalHeight > 0) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
          // safety timeout
          setTimeout(resolve, 5000);
        });
      }),
    );
  });
};

(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: VIEWPORT,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const consoleErrors = [];

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

    await page.goto(LANDING_URL, { waitUntil: "networkidle2", timeout: 30000 });

    // Reveal all fade-up sections + hide Astro dev toolbar
    await page.evaluate(() => {
      document.querySelectorAll(".spent-fade-up").forEach((el) => el.classList.add("is-visible"));
      const css = document.createElement("style");
      css.textContent = `
				astro-dev-toolbar, astro-dev-overlay, [astro-dev-toolbar] { display: none !important; }
			`;
      document.head.appendChild(css);
    });

    // Scroll the whole page to trigger lazy loads
    await page.evaluate(async () => {
      const total = document.documentElement.scrollHeight;
      for (let y = 0; y < total; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 80));
      }
      window.scrollTo(0, 0);
    });

    await waitForImages(page);
    await new Promise((r) => setTimeout(r, 600));

    // Full-page screenshot
    const fullPath = path.join(OUT_DIR, "00-fullpage.png");
    await page.screenshot({ path: fullPath, fullPage: true });
    console.log(`✓ 00-fullpage.png`);

    // Section-by-section
    const errors = [];
    for (const sec of SECTION_SELECTORS) {
      const el = await page.$(sec.selector);
      if (!el) {
        errors.push(`✗ ${sec.name}: selector "${sec.selector}" not found`);
        continue;
      }
      // Scroll the section into view so any lazy images load
      await el.evaluate((node) => {
        node.scrollIntoView({ block: "start" });
      });
      await new Promise((r) => setTimeout(r, 250));
      await waitForImages(page);
      const dest = path.join(OUT_DIR, `${sec.name}.png`);
      try {
        await el.screenshot({ path: dest });
        console.log(`✓ ${sec.name}.png (${sec.selector})`);
      } catch (e) {
        errors.push(`✗ ${sec.name}: ${e.message}`);
      }
    }

    if (errors.length) {
      console.log("\n=== Capture errors ===");
      console.log(errors.join("\n"));
    }

    console.log(`\n=== Console errors during run: ${consoleErrors.length} ===`);
    if (consoleErrors.length) {
      console.log(consoleErrors.slice(0, 10).join("\n"));
    }

    console.log(`\nShots in: ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
