// Utilities for theme-aware label color processing
// Used by task-labels-display.tsx and label management pages

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

function hexToRgb(hex: string) {
  const n = normalizeHex(hex);
  if (!n) return null;
  const r = parseInt(n.substring(1, 3), 16);
  const g = parseInt(n.substring(3, 5), 16);
  const b = parseInt(n.substring(5, 7), 16);
  return { r, g, b };
}

function luminance({ r, g, b }: { r: number; g: number; b: number }) {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function adjust(hex: string, factor: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  // Convert to HSL for perceptual lightness adjustment preserving hue & saturation better.
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
  // Apply factor to lightness; clamp within [0,1]. Using a gentle curve to avoid blasting to pure white.
  const targetL = Math.min(
    1,
    Math.max(0, l * (factor >= 1 ? 1 + (factor - 1) * 0.75 : factor))
  );
  // Slightly reduce saturation for very lightened colors to keep text legible on tinted bg.
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

export interface AccessibleLabelStyles {
  bg: string; // background 10% opacity
  border: string; // subtle border ~30-60% opacity
  text: string; // full opacity adjusted for contrast
}

/**
 * Compute accessible label styles based on theme.
 * Colors picked for dark mode are automatically adjusted for light mode visibility.
 *
 * @param raw - Raw color string (hex or color name)
 * @param isDark - Whether the current theme is dark mode
 * @returns Accessible styles object with bg, border, and text colors, or null if invalid color
 */
export function computeAccessibleLabelStyles(
  raw: string,
  isDark: boolean
): AccessibleLabelStyles | null {
  const nameMap: Record<string, string> = {
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
  const baseHex = normalizeHex(raw) || nameMap[raw.toLowerCase?.()] || null;
  if (!baseHex) return null;
  const rgb = hexToRgb(baseHex);
  if (!rgb) return null;
  const lum = luminance(rgb);
  // 10% opacity = ~0x1A; 30% opacity = ~0x4D; 40% opacity = ~0x66; 60% opacity = ~0x99
  const bg = `${baseHex}1a`;
  let border: string;
  let text = baseHex; // full opacity

  // Adjust text color based on theme and luminance
  if (isDark) {
    // Dark mode: lighten colors for better visibility
    border = `${baseHex}4d`; // 30% opacity in dark mode
    if (lum < 0.35) {
      // Lighten dark colors significantly
      text = adjust(baseHex, 1.5);
    } else if (lum < 0.6) {
      // Moderately lighten mid-tone colors
      text = adjust(baseHex, 1.25);
    }
    // Light colors stay as-is or slightly adjusted
    else if (lum > 0.85) {
      text = adjust(baseHex, 0.9);
    }
  } else {
    // Light mode: darken colors aggressively (colors picked for dark mode need significant darkening)
    if (lum < 0.18) {
      // Very dark colors: lighten slightly
      text = adjust(baseHex, 1.4);
      border = `${baseHex}4d`; // 30% opacity for dark colors
    } else if (lum < 0.35) {
      // Dark colors: lighten a bit
      text = adjust(baseHex, 1.2);
      border = `${baseHex}66`; // 40% opacity
    } else if (lum < 0.55) {
      // Mid-tone colors: darken moderately
      text = adjust(baseHex, 0.65);
      border = `${adjust(baseHex, 0.65)}99`; // Use darkened color at 60% opacity
    } else if (lum < 0.75) {
      // Bright colors: darken significantly
      text = adjust(baseHex, 0.5);
      border = `${adjust(baseHex, 0.5)}99`; // Use darkened color at 60% opacity
    } else if (lum < 0.85) {
      // Very bright colors: darken heavily
      text = adjust(baseHex, 0.4);
      border = `${adjust(baseHex, 0.4)}99`; // Use darkened color at 60% opacity
    } else {
      // Extremely bright colors (like bright yellows): darken extra heavily
      text = adjust(baseHex, 0.3);
      border = `${adjust(baseHex, 0.3)}99`; // Use heavily darkened color at 60% opacity
    }
  }

  return { bg, border, text };
}
