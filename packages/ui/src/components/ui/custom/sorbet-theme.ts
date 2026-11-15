/**
 * Sorbet theme: the palette preset and look options layered on the
 * experimental Sorbet design.
 *
 * The theme is stored on the user's account (`SORBET_THEME` in user configs) as
 * compact JSON, with a device-local copy for the next page load and for
 * signed-out pages. Every value is parsed against an allowlist; anything else
 * falls back to the default, so stored input never reaches CSS unchecked.
 *
 * The theme is applied as attributes on `<html>`. A default value removes its
 * attribute, so the default theme renders exactly as plain Sorbet.
 */

export const SORBET_THEME_CONFIG_ID = 'SORBET_THEME';
export const SORBET_THEME_STORAGE_KEY = 'tuturuuu:sorbet-theme';
/** Fired on `window` when this tab changes the theme. */
export const SORBET_THEME_CHANGE_EVENT = 'tuturuuu:sorbet-theme-change';

export const SORBET_PRESETS = [
  'sorbet',
  'matcha',
  'blueberry',
  'mango',
  'lavender',
  'lagoon',
  'rose',
  'graphite',
  'midnight',
  'high-contrast',
] as const;
export const SORBET_RADII = ['soft', 'sharp', 'round'] as const;
export const SORBET_DENSITIES = ['comfortable', 'compact', 'spacious'] as const;
export const SORBET_FONTS = ['nunito', 'noto', 'system'] as const;

export type SorbetPreset = (typeof SORBET_PRESETS)[number];
export type SorbetRadius = (typeof SORBET_RADII)[number];
export type SorbetDensity = (typeof SORBET_DENSITIES)[number];
export type SorbetFont = (typeof SORBET_FONTS)[number];

export interface SorbetTheme {
  preset: SorbetPreset;
  /** Custom accent as `#rrggbb`, or null for the preset's accent. */
  accent: string | null;
  radius: SorbetRadius;
  density: SorbetDensity;
  font: SorbetFont;
}

export const DEFAULT_SORBET_THEME: SorbetTheme = Object.freeze({
  preset: 'sorbet',
  accent: null,
  radius: 'soft',
  density: 'comfortable',
  font: 'nunito',
});

const HEX_COLOR = /^#[0-9a-f]{6}$/;
/** Longest stored value accepted; a valid theme is far shorter. */
const MAX_STORED_LENGTH = 512;

/** The `<html>` attribute for each option; the first allowlist entry is the default. */
const THEME_ATTRIBUTES = {
  preset: 'data-sorbet-preset',
  radius: 'data-sorbet-radius',
  density: 'data-sorbet-density',
  font: 'data-sorbet-font',
} as const;

function pick<T extends string>(
  allowed: readonly T[],
  value: unknown,
  fallback: T
): T {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function parseSorbetAccent(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return HEX_COLOR.test(normalized) ? normalized : null;
}

/**
 * Reads a theme from a stored string or object. Unknown fields are dropped and
 * invalid values fall back to the default, field by field.
 */
export function parseSorbetTheme(raw: unknown): SorbetTheme {
  let value = raw;
  if (typeof value === 'string') {
    if (value.length === 0 || value.length > MAX_STORED_LENGTH) {
      return { ...DEFAULT_SORBET_THEME };
    }
    try {
      value = JSON.parse(value);
    } catch {
      return { ...DEFAULT_SORBET_THEME };
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_SORBET_THEME };
  }

  const input = value as Record<string, unknown>;
  const d = DEFAULT_SORBET_THEME;
  return {
    preset: pick(SORBET_PRESETS, input.preset, d.preset),
    accent: parseSorbetAccent(input.accent),
    radius: pick(SORBET_RADII, input.radius, d.radius),
    density: pick(SORBET_DENSITIES, input.density, d.density),
    font: pick(SORBET_FONTS, input.font, d.font),
  };
}

/** Serializes only the known fields, in a fixed order. */
export function serializeSorbetTheme(theme: SorbetTheme): string {
  const parsed = parseSorbetTheme(theme);
  return JSON.stringify({
    preset: parsed.preset,
    accent: parsed.accent,
    radius: parsed.radius,
    density: parsed.density,
    font: parsed.font,
  });
}

export function readStoredSorbetTheme(): SorbetTheme | null {
  try {
    const stored = window.localStorage.getItem(SORBET_THEME_STORAGE_KEY);
    return stored === null ? null : parseSorbetTheme(stored);
  } catch {
    return null;
  }
}

function storeSorbetTheme(theme: SorbetTheme) {
  try {
    window.localStorage.setItem(
      SORBET_THEME_STORAGE_KEY,
      serializeSorbetTheme(theme)
    );
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the
    // account value still applies once it loads.
  }
}

/**
 * Applies the theme to the document and remembers it on this device. Default
 * values remove their attribute, so the default theme is plain Sorbet.
 */
export function applySorbetTheme(
  theme: SorbetTheme,
  root: HTMLElement = document.documentElement
) {
  const parsed = parseSorbetTheme(theme);
  for (const key of Object.keys(THEME_ATTRIBUTES) as Array<
    keyof typeof THEME_ATTRIBUTES
  >) {
    const attribute = THEME_ATTRIBUTES[key];
    if (parsed[key] === DEFAULT_SORBET_THEME[key]) {
      root.removeAttribute(attribute);
    } else {
      root.setAttribute(attribute, parsed[key]);
    }
  }
  storeSorbetTheme(parsed);
}

/** Applies the theme and tells other listeners in this tab. */
export function announceSorbetTheme(theme: SorbetTheme) {
  applySorbetTheme(theme);
  window.dispatchEvent(
    new CustomEvent<string>(SORBET_THEME_CHANGE_EVENT, {
      detail: serializeSorbetTheme(theme),
    })
  );
}
