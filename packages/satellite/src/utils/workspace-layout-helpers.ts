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

export type SidebarBehavior = 'expanded' | 'collapsed' | 'hover' | 'hidden';

/**
 * Parse and validate the sidebar behavior from cookies.
 */
export function parseSidebarBehavior(
  cookies: ReadonlyRequestCookies,
  fallback: SidebarBehavior = 'expanded'
): SidebarBehavior {
  const behaviorCookie = cookies.get(SIDEBAR_BEHAVIOR_COOKIE_NAME);
  const rawBehavior = behaviorCookie?.value;

  const isValidBehavior = (
    value: string | undefined
  ): value is SidebarBehavior => {
    if (!value) return false;
    return ['expanded', 'collapsed', 'hover', 'hidden'].includes(value);
  };

  return isValidBehavior(rawBehavior) ? rawBehavior : fallback;
}

/**
 * Determine the sidebar collapsed state based on behavior and cookie.
 */
export function getSidebarCollapsedState(
  cookies: ReadonlyRequestCookies,
  sidebarBehavior: SidebarBehavior
): boolean {
  if (
    sidebarBehavior === 'collapsed' ||
    sidebarBehavior === 'hover' ||
    sidebarBehavior === 'hidden'
  ) {
    return true;
  }

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
