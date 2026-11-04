/**
 * Download each provider's icon once and store it in the repo, so the app never asks a third party
 * (Google's favicon service) for logos at runtime, which would reveal which banks the user has.
 *
 * Sources, in order: Google's 128px favicon (what the app used to load live), then the bank's own
 * apple-touch-icon and favicon. Every image is decoded and re-encoded by sharp into a 128x128 PNG,
 * so nothing downloaded is stored as-is.
 *
 * Output: public/banks/<domain>.png and src/lib/provider-logos.generated.ts
 * Usage:  node scripts/fetch-provider-icons.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { lookup } from "node:dns/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "banks");
const manifest = path.join(root, "src", "lib", "provider-logos.generated.ts");
const MAX_BYTES = 512 * 1024;
// Some bank sites refuse requests that do not look like a browser.
const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" };

const typesSource = await fs.readFile(path.join(root, "src", "lib", "types.ts"), "utf8");
const domains = [...new Set([...typesSource.matchAll(/domain:\s*"([a-z0-9.-]+)"/g)].map((m) => m[1]))].sort();

async function download(url) {
  try {
    const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= MAX_BYTES ? buf : null;
  } catch {
    return null;
  }
}

// A 32-bit or 24-bit BMP image inside an .ico (no file header, rows bottom-up, BGR(A)), as raw RGBA for sharp.
function rawFromIcoBmp(data) {
  if (data.length < 40 || data.readUInt32LE(0) !== 40) return null;
  const width = data.readInt32LE(4);
  const height = data.readInt32LE(8) / 2; // the stored height includes the AND mask
  const bpp = data.readUInt16LE(14);
  if (width <= 0 || height <= 0 || width > 512 || (bpp !== 32 && bpp !== 24)) return null;
  const stride = Math.ceil((width * bpp) / 32) * 4;
  if (40 + stride * height > data.length) return null;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = 40 + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const p = row + x * (bpp / 8);
      const o = (y * width + x) * 4;
      rgba[o] = data[p + 2];
      rgba[o + 1] = data[p + 1];
      rgba[o + 2] = data[p];
      rgba[o + 3] = bpp === 32 ? data[p + 3] : 255;
    }
  }
  return { rgba, width, height };
}

// An .ico file is a container of PNG or BMP images. Returns the largest, ready for sharp.
function imageFromIco(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return { buf };
  let best = null;
  for (let i = 0; i < buf.readUInt16LE(4); i++) {
    const entry = 6 + i * 16;
    if (entry + 16 > buf.length) break;
    const size = buf.readUInt32LE(entry + 8);
    const offset = buf.readUInt32LE(entry + 12);
    const data = buf.subarray(offset, offset + size);
    const width = buf[entry] || 256;
    if (best && width <= best.width) continue;
    if (data.length > 8 && data.readUInt32BE(0) === 0x89504e47) best = { width, buf: data };
    else {
      const raw = rawFromIcoBmp(data);
      if (raw) best = { width, raw };
    }
  }
  return best ?? { buf };
}

// Icon links declared in the bank's homepage, largest declared size first.
async function iconLinks(domain) {
  const res = await fetch(`https://www.${domain}/`, { headers, redirect: "follow", signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res?.ok) return [];
  const html = (await res.text()).slice(0, 200_000);
  const links = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /rel=["'][^"']*icon[^"']*["']/i.test(tag))
    .map((tag) => ({
      href: /href=["']([^"']+)["']/i.exec(tag)?.[1],
      size: Number(/sizes=["'](\d+)x\d+["']/i.exec(tag)?.[1] ?? 0),
    }))
    .filter((l) => l.href && !l.href.startsWith("data:"));
  return links.sort((a, b) => b.size - a.size).map((l) => new URL(l.href, res.url).toString());
}

async function toPng(downloaded) {
  const icon = imageFromIco(downloaded);
  try {
    const image = icon.raw
      ? sharp(icon.raw.rgba, { raw: { width: icon.raw.width, height: icon.raw.height, channels: 4 } })
      : sharp(icon.buf, { limitInputPixels: 4096 * 4096 });
    const { width = 0, height = 0 } = await image.metadata();
    // Google answers an unknown domain with a 16px placeholder: treat it as missing.
    if (width <= 16 && height <= 16) return null;
    return await image
      .resize(128, 128, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

await fs.mkdir(outDir, { recursive: true });
const found = [];
for (const domain of domains) {
  // A domain that no longer resolves (e.g. a bank that merged) can still get a stale or wrong icon from Google.
  const live = await lookup(`www.${domain}`).then(() => true, () => lookup(domain).then(() => true, () => false));
  if (!live) {
    console.log(`skip ${domain} (domain no longer resolves)`);
    continue;
  }
  const sources = [
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    `https://www.google.com/s2/favicons?domain=www.${domain}&sz=128`,
    `https://www.${domain}/apple-touch-icon.png`,
    `https://${domain}/apple-touch-icon.png`,
    ...(await iconLinks(domain)),
    `https://www.${domain}/favicon.ico`,
    `https://${domain}/favicon.ico`,
  ];
  let png = null;
  let from = "";
  for (const url of sources) {
    const buf = await download(url);
    png = buf && (await toPng(buf));
    if (png) {
      from = url;
      break;
    }
  }
  if (png) {
    await fs.writeFile(path.join(outDir, `${domain}.png`), png);
    found.push(domain);
    console.log(`ok   ${domain.padEnd(26)} ${String(png.length).padStart(6)} bytes  from ${from}`);
  } else {
    console.log(`miss ${domain}`);
  }
}

await fs.writeFile(
  manifest,
  `// Generated by scripts/fetch-provider-icons.mjs. Domains with a logo in public/banks.\n` +
    `export const LOCAL_PROVIDER_LOGOS: ReadonlySet<string> = new Set([\n` +
    found.map((d) => `  "${d}",\n`).join("") +
    `]);\n`
);
console.log(`\n${found.length}/${domains.length} logos saved.`);
