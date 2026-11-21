import { browserMountedAppBase } from '@tuturuuu/utils/shared-cookie';

/**
 * Calendar Plan panel open state, persisted in a cookie so the server renders
 * the panel at its final width and the grid never shifts after hydration.
 */
export const PLAN_PANEL_COOKIE_NAME = 'calendar-plan-panel';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** `true` when the cookie records an open panel; closed is the default. */
export function parsePlanPanelOpen(value: string | null | undefined) {
  return value === 'open';
}

/**
 * Host-only cookie string. A mounted app (for example tuturuuu.com/calendar)
 * scopes it to its own `Path=<base>` with `Secure`, so it never lands in the
 * shared origin's root jar; a subdomain host uses `Path=/`.
 */
export function planPanelCookie(
  open: boolean,
  mountedBase: string = browserMountedAppBase()
) {
  const scope = mountedBase ? `Path=${mountedBase}; Secure` : 'Path=/';
  return `${PLAN_PANEL_COOKIE_NAME}=${open ? 'open' : 'closed'}; ${scope}; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

/** Reads the cookie in the browser, for hosts that do not pass it in. */
export function readPlanPanelOpenFromDocument() {
  if (typeof document === 'undefined') return false;
  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${PLAN_PANEL_COOKIE_NAME}=`));
  return parsePlanPanelOpen(match?.split('=')[1]);
}
