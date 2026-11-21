import {
  type CookieOptionsLike,
  getTuturuuuSharedCookieOptions,
} from './shared-cookie';

export const SIDEBAR_SIZE_COOKIE_NAME = 'sidebar-size';
export const SIDEBAR_EXPANDED_WIDTH_DEFAULT = '16rem';
export const SIDEBAR_EXPANDED_WIDTH_MIN = '12rem';
export const SIDEBAR_EXPANDED_WIDTH_MAX = '32rem';
export const SIDEBAR_EXPANDED_MIN_PX = 192;
export const SIDEBAR_EXPANDED_MAX_PX = 512;
export const SIDEBAR_SIZE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

const ROOT_FONT_PX = 16;
const LENGTH_PATTERN = /^(\d+(?:\.\d+)?)(px|rem)$/;
const LEGACY_PANEL_PERCENTAGE = /^\d+(?:\.\d+)?%?$/;

type CookieSource = Parameters<typeof getTuturuuuSharedCookieOptions>[1];

export function sidebarSizeCookieOptions(
  source?: CookieSource
): CookieOptionsLike {
  return getTuturuuuSharedCookieOptions(
    {
      maxAge: SIDEBAR_SIZE_COOKIE_MAX_AGE,
      path: '/',
    },
    source
  );
}

function formatRem(amount: number) {
  const rounded = Math.round(amount * 1000) / 1000;
  return `${rounded}rem`;
}

/**
 * Accept a CSS length the shell can paint. Legacy resizable-panel
 * percentages (`28`, `28%`) are ignored so an unused cookie does not resize.
 */
export function parseSidebarSizeCookie(
  value: string | null | undefined
): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed || LEGACY_PANEL_PERCENTAGE.test(trimmed)) return null;

  const match = LENGTH_PATTERN.exec(trimmed);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount) || !unit) return null;

  const px = unit === 'px' ? amount : amount * ROOT_FONT_PX;
  if (px < SIDEBAR_EXPANDED_MIN_PX || px > SIDEBAR_EXPANDED_MAX_PX) {
    return null;
  }

  return unit === 'px' ? `${Math.round(amount)}px` : formatRem(amount);
}

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Last valid length wins when a host-only legacy cookie and a shared length both appear. */
export function readSidebarSizeFromCookieHeader(
  header: string | null | undefined
): string | null {
  if (!header) return null;

  let chosen: string | null = null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;

    const name = part.slice(0, separator).trim();
    if (name !== SIDEBAR_SIZE_COOKIE_NAME) continue;

    const decoded = decodeCookieValue(part.slice(separator + 1).trim());
    const parsed = parseSidebarSizeCookie(decoded);
    if (parsed) chosen = parsed;
  }

  return chosen;
}

export function resolveSidebarExpandedWidth(
  persisted: string | null,
  fallback?: string | null
): string {
  return (
    persisted ??
    parseSidebarSizeCookie(fallback) ??
    SIDEBAR_EXPANDED_WIDTH_DEFAULT
  );
}
