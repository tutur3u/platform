import {
  APEX_MIGRATION_ACTIVE,
  getAppProductionBaseUrl,
  SHARED_APP_ORIGIN,
} from '@tuturuuu/utils/app-mounts';
import {
  INTERNAL_WORKSPACE_SLUG,
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
} from '@tuturuuu/utils/constants';
import { isWorkspaceUuidLiteral } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { type Locale, supportedLocales } from '../i18n/routing';
import { getChatAppOrigin } from './chat-app-url';
import { getContactsAppOrigin } from './contacts-app-url';
import { getDriveAppOrigin } from './drive-app-url';
import { getFinanceAppOrigin } from './finance-app-url';
import { getFormsAppOrigin } from './forms-app-url';
import { getMailAppOrigin } from './mail-app-url';
import { getMeetAppOrigin } from './meet-app-url';
import { getToolsAppOrigin } from './tools-app-url';
import { getTrackAppOrigin } from './track-app-url';

function getMigrationAppUrl(app: string, legacyUrl: string) {
  return APEX_MIGRATION_ACTIVE
    ? getAppProductionBaseUrl(app, legacyUrl)
    : legacyUrl;
}

export function redirectToToolsApp(req: NextRequest, pathname: string) {
  const redirectUrl = new URL(
    APEX_MIGRATION_ACTIVE && req.nextUrl.origin === SHARED_APP_ORIGIN
      ? `${SHARED_APP_ORIGIN}/tools`
      : getToolsAppOrigin()
  );
  redirectUrl.pathname = APEX_MIGRATION_ACTIVE
    ? redirectUrl.pathname.replace(/\/$/u, '') + pathname
    : pathname;
  redirectUrl.search = req.nextUrl.search;

  return NextResponse.redirect(redirectUrl);
}

export function handleMailAppRedirectRoute(
  req: NextRequest
): NextResponse | null {
  return handleWorkspaceSatelliteRedirectRoute(req, {
    appOrigin: getMigrationAppUrl('mail', getMailAppOrigin()),
    routeSegment: 'mail',
  });
}

export function handleFinanceAppRedirectRoute(
  req: NextRequest
): NextResponse | null {
  return handleWorkspaceSatelliteRedirectRoute(req, {
    appOrigin: getMigrationAppUrl('finance', getFinanceAppOrigin()),
    routeSegment: 'finance',
  });
}

export function handleDriveAppRedirectRoute(
  req: NextRequest
): NextResponse | null {
  return handleWorkspaceSatelliteRedirectRoute(req, {
    appOrigin: getMigrationAppUrl('drive', getDriveAppOrigin()),
    routeSegment: 'drive',
  });
}

export function handleChatAppRedirectRoute(
  req: NextRequest
): NextResponse | null {
  return handleWorkspaceSatelliteRedirectRoute(req, {
    appOrigin: getMigrationAppUrl('chat', getChatAppOrigin()),
    routeSegment: 'chat',
  });
}

export function handleTrackAppRedirectRoute(
  req: NextRequest
): NextResponse | null {
  return handleWorkspaceSatelliteRedirectRoute(req, {
    appOrigin: getMigrationAppUrl('track', getTrackAppOrigin()),
    routeSegment: 'time-tracker',
  });
}

export function handleMeetAppRedirectRoute(
  req: NextRequest
): NextResponse | null {
  const response = handleWorkspaceSatelliteRedirectRoute(req, {
    appOrigin: getMeetAppOrigin(),
    routeSegment: 'meet',
    workspacePrefix: 'workspace',
  });

  return response;
}

export function handleContactsAppRedirectRoute(
  req: NextRequest
): NextResponse | null {
  for (const routeSegment of ['users', 'workforce', 'posts']) {
    const response = handleWorkspaceSatelliteRedirectRoute(req, {
      appOrigin: getMigrationAppUrl('contacts', getContactsAppOrigin()),
      routeSegment,
      preserveRouteSegment: true,
    });

    if (response) return response;
  }

  return null;
}

export function handleFormsAppRedirectRoute(
  req: NextRequest
): NextResponse | null {
  return handleWorkspaceSatelliteRedirectRoute(req, {
    appOrigin: getMigrationAppUrl('forms', getFormsAppOrigin()),
    routeSegment: 'forms',
    preserveRouteSegment: true,
  });
}

/**
 * Permanent redirect for already-distributed shared-form links.
 *
 * Public forms use the Forms app's `/f/<shareCode>` route. Every link people
 * have already sent points at `tuturuuu.com/<locale>/shared/forms/<shareCode>`,
 * and social platforms have cached OG cards against those URLs — so this must
 * be a permanent (308) redirect and must serve crawlers, not just browsers.
 */
export function handleSharedFormRedirectRoute(
  req: NextRequest
): NextResponse | null {
  const pathSegments = req.nextUrl.pathname.split('/').filter(Boolean);
  const hasLocale =
    pathSegments[0] && supportedLocales.includes(pathSegments[0] as Locale);
  const offset = hasLocale ? 1 : 0;

  if (
    pathSegments[offset] !== 'shared' ||
    pathSegments[offset + 1] !== 'forms'
  ) {
    return null;
  }

  const shareCode = pathSegments[offset + 2];
  if (!shareCode) return null;

  const redirectUrl = new URL(getMigrationAppUrl('forms', getFormsAppOrigin()));
  redirectUrl.pathname = [
    APEX_MIGRATION_ACTIVE ? redirectUrl.pathname.replace(/\/$/u, '') : '',
    'f',
    shareCode,
    // Preserve `/opengraph-image` and `/twitter-image` sub-paths.
    ...pathSegments.slice(offset + 3),
  ].join('/');
  redirectUrl.search = req.nextUrl.search;

  return NextResponse.redirect(redirectUrl, 308);
}

function handleWorkspaceSatelliteRedirectRoute(
  req: NextRequest,
  {
    appOrigin,
    preserveRouteSegment = false,
    routeSegment,
    workspacePrefix,
  }: {
    appOrigin: string;
    preserveRouteSegment?: boolean;
    routeSegment: string;
    workspacePrefix?: string;
  }
): NextResponse | null {
  const pathSegments = req.nextUrl.pathname.split('/').filter(Boolean);
  const hasLocale =
    pathSegments[0] && supportedLocales.includes(pathSegments[0] as Locale);
  const workspaceIndex = hasLocale ? 1 : 0;
  const workspaceSlug = pathSegments[workspaceIndex];

  if (!workspaceSlug || pathSegments[workspaceIndex + 1] !== routeSegment) {
    return null;
  }

  const normalizedWorkspaceSlug = workspaceSlug.toLowerCase();
  const isWorkspaceRoute =
    normalizedWorkspaceSlug === PERSONAL_WORKSPACE_SLUG ||
    normalizedWorkspaceSlug === INTERNAL_WORKSPACE_SLUG ||
    normalizedWorkspaceSlug === ROOT_WORKSPACE_ID.toLowerCase() ||
    isWorkspaceUuidLiteral(workspaceSlug);

  if (!isWorkspaceRoute) {
    return null;
  }

  const suffixSegments = pathSegments.slice(workspaceIndex + 2);
  const redirectUrl = new URL(appOrigin);
  redirectUrl.pathname = [
    redirectUrl.pathname.replace(/\/$/u, ''),
    ...(workspacePrefix ? [workspacePrefix] : []),
    workspaceSlug,
    ...(preserveRouteSegment ? [routeSegment] : []),
    ...suffixSegments,
  ].join('/');
  redirectUrl.search = req.nextUrl.search;

  return NextResponse.redirect(redirectUrl);
}
