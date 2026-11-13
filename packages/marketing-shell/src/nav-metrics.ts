/**
 * Height of the floating pill, in pixels. These match the Tailwind classes
 * on MarketingNavShell and must change together:
 * full = sm:pt-4 (16) + h-14 (56) + 4px gap
 * compact = pt-2 (8) + h-11 (44) + 4px gap
 * The full offset uses the larger desktop padding so the bar also clears
 * the shorter mobile pill (pt-3 is 12).
 */
export const NAV_CHROME = {
  full: { pad: 16, bar: 56, gap: 4 },
  compact: { pad: 8, bar: 44, gap: 4 },
} as const;

/** Distance from the viewport top to just under the pill. */
export function shellNavOffset(compact: boolean): number {
  const chrome = compact ? NAV_CHROME.compact : NAV_CHROME.full;
  return chrome.pad + chrome.bar + chrome.gap;
}

/**
 * A sticky filter bar has to start at or below the navbar. `top: 0` fails
 * this: the bar slides underneath the fixed pill.
 */
export function stickyClearsNavbar(
  stickyTop: number,
  navbarBottom: number
): boolean {
  return stickyTop >= navbarBottom;
}
