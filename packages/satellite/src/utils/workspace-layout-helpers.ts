import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
import {
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
} from '../constants/common';

export type SidebarBehavior = 'expanded' | 'collapsed' | 'hover';

/**
 * Parse and validate the sidebar behavior from cookies.
 */
export function parseSidebarBehavior(
  cookies: ReadonlyRequestCookies
): SidebarBehavior {
  const behaviorCookie = cookies.get(SIDEBAR_BEHAVIOR_COOKIE_NAME);
  const rawBehavior = behaviorCookie?.value;

  const isValidBehavior = (
    value: string | undefined
  ): value is SidebarBehavior => {
    if (!value) return false;
    return ['expanded', 'collapsed', 'hover'].includes(value);
  };

  return isValidBehavior(rawBehavior) ? rawBehavior : 'expanded';
}

/**
 * Determine the sidebar collapsed state based on behavior and cookie.
 */
export function getSidebarCollapsedState(
  cookies: ReadonlyRequestCookies,
  sidebarBehavior: SidebarBehavior
): boolean {
  if (sidebarBehavior === 'collapsed' || sidebarBehavior === 'hover') {
    return true;
  }

  const collapsed = cookies.get(SIDEBAR_COLLAPSED_COOKIE_NAME);
  return collapsed ? JSON.parse(collapsed.value) : false;
}
