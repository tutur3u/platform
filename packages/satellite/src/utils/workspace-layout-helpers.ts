import {
  readSidebarSizeFromCookieHeader,
  resolveSidebarExpandedWidth,
} from '@tuturuuu/utils/sidebar-layout-preference';
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import {
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
} from '../constants/common';

import {
  normalizeSidebarBehavior,
  restsCollapsed,
  type SidebarBehavior,
} from '@tuturuuu/ui/custom/sidebar-behavior';

export type { SidebarBehavior } from '@tuturuuu/ui/custom/sidebar-behavior';

/**
 * Parse and validate the sidebar behavior from cookies.
 */
export function parseSidebarBehavior(
  cookies: ReadonlyRequestCookies,
  fallback: SidebarBehavior = 'expanded'
): SidebarBehavior {
  // A cookie still holding the retired "hidden" mode reads as "minimal".
  return (
    normalizeSidebarBehavior(
      cookies.get(SIDEBAR_BEHAVIOR_COOKIE_NAME)?.value
    ) ?? fallback
  );
}

/**
 * Determine the sidebar collapsed state based on behavior and cookie.
 */
export function getSidebarCollapsedState(
  cookies: ReadonlyRequestCookies,
  sidebarBehavior: SidebarBehavior
): boolean {
  if (restsCollapsed(sidebarBehavior)) return true;

  const collapsed = cookies.get(SIDEBAR_COLLAPSED_COOKIE_NAME)?.value?.trim();
  return collapsed === 'true';
}

/**
 * Expanded width for the shell's server HTML.
 *
 * `cookieHeader` is the raw `Cookie` request header (`headers().get('cookie')`).
 * Next's `cookies()` jar keeps one value per name before `get` and `getAll`,
 * so a later legacy `sidebar-size=28` hides an earlier `sidebar-size=20rem`.
 * This reader keeps the last valid length instead. Mail passes `15rem`.
 * Calendar and Meet pass `16rem`.
 */
export function parseSidebarExpandedWidth(
  cookieHeader: string | null | undefined,
  fallback = '16rem'
): string {
  return resolveSidebarExpandedWidth(
    readSidebarSizeFromCookieHeader(cookieHeader),
    fallback
  );
}

/**
 * Parse the local sidebar behavior timestamp from cookies.
 */
export function getSidebarBehaviorUpdatedAt(
  cookies: ReadonlyRequestCookies
): number | null {
  const updatedAtCookie = cookies.get(SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME);
  if (!updatedAtCookie?.value) return null;

  const updatedAt = Number(updatedAtCookie.value);
  return Number.isSafeInteger(updatedAt) && updatedAt > 0 ? updatedAt : null;
}
