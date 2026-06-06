/**
 * Shared helpers for deriving tints/shades from a category's hex color.
 * Category colors come from the database (the one legitimate place for inline
 * color); everything else uses design tokens. See docs/design-system.md.
 */

export function parseHex(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return { r: 148, g: 148, b: 148 };
  }
  return { r, g, b };
}

/** Translucent version of a hex color, e.g. for a soft chip background. */
export function tint(hex: string, opacity: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** A darker, opaque version of a hex color for text/icons on a tinted chip. */
export function shade(hex: string, factor = 0.78): string {
  const { r, g, b } = parseHex(hex);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}
