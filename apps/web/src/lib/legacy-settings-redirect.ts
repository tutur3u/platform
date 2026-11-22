import { propagateAuthCookies } from '@tuturuuu/auth/proxy';
import {
  buildSettingsDialogHref,
  sanitizeSettingsTabId,
  SETTINGS_TAB_PARAM,
  SHARED_SETTINGS_TAB_IDS,
} from '@tuturuuu/ui/hooks/settings-dialog-url';
import { type NextRequest, NextResponse } from 'next/server';
import {
  KNOWN_ROOT_ROUTE_SEGMENTS,
  WORKSPACE_CHILD_ROUTE_SEGMENTS,
} from './route-shape';
import { defaultWorkspaceHomeRedirectUrl } from './workspace-home-redirect';

const accountTabs = new Set<string>(Object.values(SHARED_SETTINGS_TAB_IDS));

export function legacySettingsTab(
  pathnameWithoutLocale: string,
  query?: URLSearchParams
): string | null {
  const [root, child, section, tab, ...rest] = pathnameWithoutLocale
    .split('/')
    .filter(Boolean);

  let requestedTab: string | undefined;
  if (root === 'settings' && child !== 'settings') {
    if (
      tab ||
      (section && child !== 'account') ||
      (child &&
        WORKSPACE_CHILD_ROUTE_SEGMENTS.has(child) &&
        !accountTabs.has(child))
    ) {
      return null;
    }
    requestedTab = child === 'account' ? section : child;
  } else if (
    root &&
    !KNOWN_ROOT_ROUTE_SEGMENTS.has(root) &&
    child === 'settings'
  ) {
    // General, Notifications and Reports still have workspace pages.
    if (section === 'account' && rest.length === 0) {
      requestedTab = tab;
    } else {
      const accountTab = sanitizeSettingsTabId(section);
      if (
        tab ||
        !accountTab ||
        accountTab === SHARED_SETTINGS_TAB_IDS.notifications ||
        !accountTabs.has(accountTab)
      ) {
        return null;
      }
      requestedTab = accountTab;
    }
  } else {
    return null;
  }

  return (
    sanitizeSettingsTabId(requestedTab ?? query?.get(SETTINGS_TAB_PARAM)) ??
    SHARED_SETTINGS_TAB_IDS.profile
  );
}

export async function legacySettingsRedirectResponse(
  req: NextRequest,
  authResponse: NextResponse,
  pathnameWithoutLocale: string,
  localize: (path: string) => string
): Promise<NextResponse | null> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;

  const tab = legacySettingsTab(
    pathnameWithoutLocale,
    req.nextUrl.searchParams
  );
  if (!tab) return null;
  if (authResponse.status >= 400) return authResponse;

  const dashboardUrl =
    (await defaultWorkspaceHomeRedirectUrl(req, localize)) ??
    new URL(localize('/personal'), req.nextUrl);
  dashboardUrl.search = req.nextUrl.search;
  const response = NextResponse.redirect(
    buildSettingsDialogHref(dashboardUrl.href, tab)
  );
  propagateAuthCookies(authResponse, response);
  return response;
}
