/**
 * Download bank logos from Wikimedia and save them locally.
 *
 * Wikimedia hosts public-domain or fair-use bank logos that are appropriate
 * to reference on an OSS landing page. Banks without a curated source URL
 * are skipped and the landing page falls back to its colored letter-tile
 * design for them.
 *
 * Output: website/src/assets/banks/{id}.png
 *
 * Usage:
 *   node scripts/fetch-bank-logos.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve(new URL(".", import.meta.url).pathname, "../website/src/assets/banks");

// Curated Wikimedia URLs (PNG thumbnails of SVG sources).
// 250px is enough at the rendered tile size (~80–96px).
const LOGOS = {
  hapoalim:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Bank_happoalim_2018_logo.svg/250px-Bank_happoalim_2018_logo.svg.png",
  leumi:
    "https://upload.wikimedia.org/wikipedia/en/thumb/f/f8/Bank_Leumi_logo.svg/250px-Bank_Leumi_logo.svg.png",
  mizrahi:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/%D7%9C%D7%95%D7%92%D7%95_%D7%A9%D7%9C_%D7%91%D7%A0%D7%A7_%D7%9E%D7%96%D7%A8%D7%97%D7%99-%D7%98%D7%A4%D7%97%D7%95%D7%AA.svg/250px-%D7%9C%D7%95%D7%92%D7%95_%D7%A9%D7%9C_%D7%91%D7%A0%D7%A7_%D7%9E%D7%96%D7%A8%D7%97%D7%99-%D7%98%D7%A4%D7%97%D7%95%D7%AA.svg.png",
  discount:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Discount_Bank%2C_Ltd_logo.svg/250px-Discount_Bank%2C_Ltd_logo.svg.png",
  isracard:
    "https://upload.wikimedia.org/wikipedia/en/thumb/a/ab/Isracard_2023_Logo.svg/250px-Isracard_2023_Logo.svg.png",
  fibi: "https://upload.wikimedia.org/wikipedia/en/thumb/9/96/First_International_Bank_of_Israel_logo.svg/250px-First_International_Bank_of_Israel_logo.svg.png",
  union:
    "https://upload.wikimedia.org/wikipedia/en/thumb/d/d6/Bank_Igud_logo.svg/250px-Bank_Igud_logo.svg.png",
};

const userAgent = "SpentLandingBuild/0.1 (https://github.com/alon710/Spent)";

const fetchLogo = async (url) => {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "image/png,image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return { ok: false, status: "wrong-content-type" };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) return { ok: false, status: "too-small" };
    return { ok: true, buf };
  } catch (e) {
    return { ok: false, status: e.message };
  }
};

(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const found = [];
  const errors = [];
  for (const [id, url] of Object.entries(LOGOS)) {
    const result = await fetchLogo(url);
    if (result.ok) {
      const dest = path.join(OUT_DIR, `${id}.png`);
      await fs.writeFile(dest, result.buf);
      found.push(id);
      console.log(`✓ ${id.padEnd(12)} ${result.buf.length.toString().padStart(7)} bytes`);
    } else {
      errors.push({ id, status: result.status });
      console.log(`✗ ${id.padEnd(12)} ${result.status}`);
    }
  }

  console.log(`\nFetched ${found.length}/${Object.keys(LOGOS).length} logos.`);
  if (errors.length) {
    console.log(`Failed: ${errors.map((e) => `${e.id} (${e.status})`).join(", ")}`);
  }
  console.log(`\nNote: banks without curated sources fall back to the colored letter-tile.`);
})().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
