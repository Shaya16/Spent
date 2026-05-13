function oklchToHex(L, C, H) {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const toSrgb = (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    if (clamped <= 0.0031308) return 12.92 * clamped;
    return 1.055 * clamped ** (1 / 2.4) - 0.055;
  };
  r = toSrgb(r);
  g = toSrgb(g);
  bl = toSrgb(bl);

  const toHex = (v) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

const categories = [
  ["Groceries",         0.72, 0.09,  145],
  ["Restaurants",       0.76, 0.10,   40],
  ["Transport",         0.72, 0.09,  230],
  ["Shopping",          0.80, 0.09,   80],
  ["Entertainment",     0.76, 0.09,   10],
  ["Health",            0.74, 0.08,  170],
  ["Education",         0.72, 0.09,  275],
  ["Bills & Utilities", 0.74, 0.04,   80],
  ["Subscriptions",     0.73, 0.09,  295],
  ["Travel",            0.74, 0.09,  220],
  ["Cash & ATM",        0.82, 0.09,   90],
  ["Transfers",         0.74, 0.035, 270],
  ["Insurance",         0.76, 0.09,   20],
  ["Home",              0.76, 0.09,   75],
  ["Personal Care",     0.78, 0.09,  325],
  ["Other",             0.74, 0.022,  85],
];

for (const [name, L, C, H] of categories) {
  console.log(`${name.padEnd(20)} oklch(${L} ${C} ${H})  →  ${oklchToHex(L, C, H)}`);
}

console.log("\nNew-category palette (for AI proposals):");
const palette = [
  ["light olive",       0.78, 0.09, 130],
  ["sandy orange",      0.78, 0.10,  60],
  ["light cyan-blue",   0.76, 0.09, 210],
  ["bright pink",       0.74, 0.10, 340],
  ["medium violet",     0.66, 0.11, 290],
  ["jade",              0.76, 0.09, 170],
  ["dusty indigo",      0.66, 0.09, 270],
  ["medium slate",      0.74, 0.025, 260],
  ["mauve",             0.75, 0.09, 310],
  ["mint",              0.82, 0.08, 165],
  ["sand gold",         0.82, 0.09,  95],
  ["sage tan",          0.78, 0.04,  95],
];
for (const [name, L, C, H] of palette) {
  console.log(`${name.padEnd(20)} oklch(${L} ${C} ${H})  →  ${oklchToHex(L, C, H)}`);
}
