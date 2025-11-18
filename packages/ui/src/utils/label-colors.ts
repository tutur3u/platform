/**
 * Label color utilities for computing accessible label styles with proper contrast.
 * These functions handle color normalization, luminance calculation, and automatic
 * color adjustments to ensure accessibility standards are met.
 */

/**
 * Normalize a hex color string to a standard 6-character format.
 * Handles both 3-character and 6-character hex codes, with or without # prefix.
 *
 * @param input - Raw color string (e.g., "#f00", "ff0000", "#ff0000")
 * @returns Normalized hex string with # prefix, or null if invalid
 */
function normalizeHex(input: string): string | null {
  if (!input) return null;
  let c = input.trim();
  if (c.startsWith('#')) c = c.slice(1);
  if (c.length === 3) {
    c = c
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (c.length !== 6) return null;
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return null;
  return `#${c.toLowerCase()}`;
}

/**
 * Convert a hex color to RGB values.
 *
 * @param hex - Hex color string
 * @returns RGB object with r, g, b values (0-255), or null if invalid
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  const r = parseInt(n.substring(1, 3), 16);
  const g = parseInt(n.substring(3, 5), 16);
  const b = parseInt(n.substring(5, 7), 16);
  return { r, g, b };
}

/**
 * Calculate the relative luminance of an RGB color.
 * Uses the WCAG formula for luminance calculation.
 *
 * @param rgb - RGB color object
 * @returns Relative luminance value (0-1)
 */
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Adjust the brightness of a hex color by modifying its lightness.
 * Converts to HSL, adjusts lightness and saturation, then converts back to hex.
 *
 * @param hex - Hex color string
 * @param factor - Brightness factor (< 1 darkens, > 1 lightens)
 * @returns Adjusted hex color string
 */
function adjust(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const rN = rgb.r / 255;
  const gN = rgb.g / 255;
  const bN = rgb.b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rN:
        h = (gN - bN) / d + (gN < bN ? 6 : 0);
        break;
      case gN:
        h = (bN - rN) / d + 2;
        break;
      default:
        h = (rN - gN) / d + 4;
    }
    h /= 6;
  }
  const targetL = Math.min(
    1,
    Math.max(0, l * (factor >= 1 ? 1 + (factor - 1) * 0.75 : factor))
  );
  const targetS = factor > 1 && targetL > 0.7 ? s * 0.85 : s;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q =
    targetL < 0.5
      ? targetL * (1 + targetS)
      : targetL + targetS - targetL * targetS;
  const p = 2 * targetL - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Color name to hex mapping for common color names.
 * Supports Tailwind-style color names.
 */
const COLOR_NAME_MAP: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  fuchsia: '#d946ef',
  pink: '#ec4899',
  rose: '#f43f5e',
  gray: '#6b7280',
  slate: '#64748b',
  zinc: '#71717a',
};

/**
 * Compute accessible label styles with proper contrast.
 * Automatically adjusts text color based on luminance to ensure readability.
 *
 * @param raw - Raw color input (hex code or color name)
 * @returns Object with bg, border, and text colors, or null if invalid
 */
export function computeAccessibleLabelStyles(
  raw: string
): { bg: string; border: string; text: string } | null {
  const baseHex =
    normalizeHex(raw) || COLOR_NAME_MAP[raw.toLowerCase?.()] || null;
  if (!baseHex) return null;
  const rgb = hexToRgb(baseHex);
  if (!rgb) return null;
  const lum = luminance(rgb);
  const bg = `${baseHex}1a`;
  const border = `${baseHex}4d`;
  let text = baseHex;
  if (lum < 0.22) {
    text = adjust(baseHex, 1.25);
  } else if (lum > 0.82) {
    text = adjust(baseHex, 0.65);
  }
  return { bg, border, text };
}
