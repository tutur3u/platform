import { match } from '@formatjs/intl-localematcher';
import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import {
  createCentralizedAuthProxy,
  propagateAuthCookies,
} from '@tuturuuu/auth/proxy';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { getMalformedSupabaseAuthCookieNames } from '@tuturuuu/supabase/next/proxy';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  extractIPFromRequest,
  isIPBlockedEdge,
  recordMalformedAuthCookieEdge,
  recordSuspiciousApiRequestEdge,
} from '@tuturuuu/utils/abuse-protection/edge';
import {
  guardApiProxyRequest,
  hasSupabaseSessionCookie,
  isTrustedProxyBypassRequest,
  type ProxyRoutePolicy,
  type RateLimitProfile,
} from '@tuturuuu/utils/api-proxy-guard';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getUserDefaultWorkspace } from '@tuturuuu/utils/user-helper';
import {
  isPersonalWorkspace,
  isWorkspaceUuidLiteral,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import Negotiator from 'negotiator';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { BASE_URL, LOCALE_COOKIE_NAME, PUBLIC_PATHS } from './constants/common';
import { defaultLocale, type Locale, supportedLocales } from './i18n/routing';
import {
  getWorkspaceRoutePermissionRequirements,
  hasRequiredWorkspaceRoutePermission,
} from './lib/workspace-route-permissions';

// Paths that should bypass onboarding check (public/marketing pages + auth flows)
const ONBOARDING_BYPASS_PATHS = [
  // Auth flows
  '/onboarding',
  '/login',
  '/signup',
  '/auth',
  '/api',
  '/logout',
  '/account/delete',
  '/verify',
  '/~recover-browser-state',
  '/reset-password',
  '/mfa',
  ...PUBLIC_PATHS,
];

const isDev = process.env.NODE_ENV !== 'production';
const NEXT_PUBLIC_ENV_PREFIX = 'NEXT_PUBLIC';

function getRuntimePublicEnvValue(name: string) {
  return process.env[`${NEXT_PUBLIC_ENV_PREFIX}_${name}`];
}

function resolveConfiguredOrigin(value?: string) {
  if (!value) {
    return null;
  }

  const [firstValue] = value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!firstValue) {
    return null;
  }

  const normalized = /^[a-z]+:\/\//iu.test(firstValue)
    ? firstValue
    : `https://${firstValue}`;

  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

const WEB_APP_URL = isDev
  ? BASE_URL
  : resolveConfiguredOrigin(process.env.WEB_APP_URL) ||
    resolveConfiguredOrigin(getRuntimePublicEnvValue('WEB_APP_URL')) ||
    resolveConfiguredOrigin(getRuntimePublicEnvValue('APP_URL')) ||
    resolveConfiguredOrigin(process.env.COOLIFY_URL) ||
    resolveConfiguredOrigin(process.env.COOLIFY_FQDN) ||
    'https://tuturuuu.com';
const OFFLINE_FALLBACK_PATH = '/~offline';
const BROWSER_STATE_RECOVERY_PATH = '/~recover-browser-state';
const RESERVED_ROOT_SEGMENT_PREFIX = '~';
const BLOCKED_ROOT_SEGMENT_PREFIX = '.';
const EMAIL_ROUTE_WORKSPACE_PATTERN =
  /^\/api\/v1\/workspaces\/([^/]+)\/(?:mail\/send|users\/[^/]+\/follow-up|user-groups\/[^/]+\/group-checks\/[^/]+\/email)(?:\/|$)/;
const EMAIL_RATE_LIMIT_OVERRIDE_SECRET_NAMES = [
  'EMAIL_RATE_LIMIT_MINUTE',
  'EMAIL_RATE_LIMIT_HOUR',
  'EMAIL_RATE_LIMIT_DAY',
  'EMAIL_RATE_LIMIT_USER_MINUTE',
  'EMAIL_RATE_LIMIT_USER_HOUR',
  'EMAIL_RATE_LIMIT_RECIPIENT_HOUR',
  'EMAIL_RATE_LIMIT_RECIPIENT_DAY',
  'EMAIL_RATE_LIMIT_IP_MINUTE',
  'EMAIL_RATE_LIMIT_IP_HOUR',
] as const;
const EMAIL_RATE_LIMIT_OVERRIDE_PROXY_RATE_LIMITS = {
  get: [],
  mutate: [
    { window: 'minute', limit: 30, duration: '1 m' },
    { window: 'hour', limit: 120, duration: '1 h' },
    { window: 'day', limit: 600, duration: '1 d' },
  ],
} satisfies RateLimitProfile;
const EMAIL_RATE_LIMIT_OVERRIDE_ROUTE_POLICY: ProxyRoutePolicy = {
  key: 'email-rate-limit-override',
  matches: (req) => EMAIL_ROUTE_WORKSPACE_PATTERN.test(req.nextUrl.pathname),
  rateLimits: EMAIL_RATE_LIMIT_OVERRIDE_PROXY_RATE_LIMITS,
};
const SUSPICIOUS_QUERY_LENGTH_MAX = parsePositiveIntEnv(
  'PROXY_SUSPICIOUS_QUERY_LENGTH_MAX',
  1024
);
const SUSPICIOUS_QUERY_PARAMS_MAX = parsePositiveIntEnv(
  'PROXY_SUSPICIOUS_QUERY_PARAMS_MAX',
  24
);
const SCANNER_PATH_PATTERN =
  /(wp-admin|wp-login\.php|xmlrpc\.php|phpmyadmin|adminer|\.env|\.git|boaform|server-status|cgi-bin|vendor\/phpunit|actuator|jenkins|hudson|\/shell|\/debug)/i;
const ROOT_DEFAULT_NAVIGATION_CONFIG_ID = 'ROOT_DEFAULT_NAVIGATION';
const TASKS_OPEN_DEFAULT_BOARD_CONFIG_ID = 'TASKS_OPEN_DEFAULT_BOARD';

type RootNavigationTarget = 'workspace_home' | 'tasks' | 'calendar' | 'finance';

type RootNavigationConfig = {
  target: RootNavigationTarget;
  submodule?: string;
  boardId?: string;
};

const ROOT_NAVIGATION_TARGETS: readonly RootNavigationTarget[] = [
  'workspace_home',
  'tasks',
  'calendar',
  'finance',
];

function parsePositiveIntEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isRootNavigationTarget(value: unknown): value is RootNavigationTarget {
  return ROOT_NAVIGATION_TARGETS.includes(value as RootNavigationTarget);
}

function parseRootNavigationConfig(value: string | null): RootNavigationConfig {
  if (!value) {
    return { target: 'workspace_home' };
  }

  try {
    const parsed = JSON.parse(value) as RootNavigationConfig;
    if (!isRootNavigationTarget(parsed?.target)) {
      return { target: 'workspace_home' };
    }

    return parsed;
  } catch {
    return { target: 'workspace_home' };
  }
}

function prependLocalePrefix(path: string, localePrefix: string): string {
  if (!localePrefix) {
    return path;
  }

  return path === '/' ? localePrefix : `${localePrefix}${path}`;
}

function isWorkspaceHomeRedirectCandidate(
  workspaceSlug: string | undefined
): workspaceSlug is string {
  if (!workspaceSlug) {
    return false;
  }

  const pathname = `/${workspaceSlug}`;
  return !PUBLIC_PATHS.includes(pathname);
}

async function resolveRootRedirectPath(
  userId: string,
  workspace: { id: string; personal?: boolean }
): Promise<{ path: string; staleConfigValue: string | null }> {
  const sbAdmin = await createAdminClient();
  const { data: configRow } = await sbAdmin
    .from('user_workspace_configs')
    .select('value')
    .eq('user_id', userId)
    .eq('ws_id', workspace.id)
    .eq('id', ROOT_DEFAULT_NAVIGATION_CONFIG_ID)
    .maybeSingle();

  const parsed = parseRootNavigationConfig(configRow?.value ?? null);

  if (parsed.target === 'workspace_home') {
    return { path: `/${workspace.id}`, staleConfigValue: null };
  }

  if (parsed.target === 'calendar') {
    return { path: `/${workspace.id}/calendar`, staleConfigValue: null };
  }

  if (parsed.target === 'finance') {
    const financeSubmodule = parsed.submodule;
    if (financeSubmodule === 'transactions') {
      return {
        path: `/${workspace.id}/finance/transactions`,
        staleConfigValue: null,
      };
    }
    if (financeSubmodule === 'wallets') {
      return {
        path: `/${workspace.id}/finance/wallets`,
        staleConfigValue: null,
      };
    }
    if (financeSubmodule === 'invoices') {
      return {
        path: `/${workspace.id}/finance/invoices`,
        staleConfigValue: null,
      };
    }

    return { path: `/${workspace.id}/finance`, staleConfigValue: null };
  }

  if (parsed.target === 'tasks') {
    if (parsed.submodule === 'boards') {
      if (parsed.boardId) {
        const { data: board, error: boardLookupError } = await sbAdmin
          .from('workspace_boards')
          .select('id')
          .eq('id', parsed.boardId)
          .eq('ws_id', workspace.id)
          .is('deleted_at', null)
          .is('archived_at', null)
          .maybeSingle();

        if (boardLookupError) {
          return {
            path: `/${workspace.id}/tasks/boards`,
            staleConfigValue: null,
          };
        }

        if (board?.id) {
          return {
            path: `/${workspace.id}/tasks/boards/${board.id}`,
            staleConfigValue: null,
          };
        }

        return {
          path: `/${workspace.id}/tasks/boards`,
          staleConfigValue: JSON.stringify({
            target: 'tasks',
            submodule: 'boards',
          }),
        };
      }

      if (workspace.personal) {
        const { data: openDefaultBoardConfig } = await sbAdmin
          .from('user_configs')
          .select('value')
          .eq('user_id', userId)
          .eq('id', TASKS_OPEN_DEFAULT_BOARD_CONFIG_ID)
          .maybeSingle();
        const shouldOpenDefaultBoard =
          openDefaultBoardConfig?.value == null ||
          openDefaultBoardConfig.value === 'true';

        if (shouldOpenDefaultBoard) {
          const { data: defaultBoard } = await sbAdmin
            .from('workspace_boards')
            .select('id')
            .eq('ws_id', workspace.id)
            .ilike('name', 'tasks')
            .is('deleted_at', null)
            .is('archived_at', null)
            .limit(1)
            .maybeSingle();

          if (defaultBoard?.id) {
            return {
              path: `/${workspace.id}/tasks/boards/${defaultBoard.id}`,
              staleConfigValue: null,
            };
          }
        }
      }

      return { path: `/${workspace.id}/tasks/boards`, staleConfigValue: null };
    }

    return { path: `/${workspace.id}/tasks`, staleConfigValue: null };
  }

  return { path: `/${workspace.id}`, staleConfigValue: null };
}

async function hasWorkspaceEmailRateLimitOverrides(
  pathname: string
): Promise<boolean> {
  const match = pathname.match(EMAIL_ROUTE_WORKSPACE_PATTERN);
  const wsId = match?.[1];
  const resolvedWsId = wsId ? resolveWorkspaceId(wsId) : null;

  if (
    !wsId ||
    !resolvedWsId ||
    wsId.startsWith(RESERVED_ROOT_SEGMENT_PREFIX) ||
    !isWorkspaceUuidLiteral(resolvedWsId) ||
    (await isPersonalWorkspace(resolvedWsId))
  ) {
    return false;
  }

  try {
    const sbAdmin = await createAdminClient({ noCookie: true });
    const { count, error } = await sbAdmin
      .from('workspace_secrets')
      .select('name', { count: 'exact', head: true })
      .eq('ws_id', resolvedWsId)
      .in('name', [...EMAIL_RATE_LIMIT_OVERRIDE_SECRET_NAMES]);

    if (error) {
      console.error(
        'Error checking workspace email rate limit overrides in proxy:',
        error
      );
      return false;
    }

    return (count ?? 0) > 0;
  } catch (error) {
    console.error(
      'Failed to load workspace email rate limit overrides in proxy:',
      error
    );
    return false;
  }
}

function looksLikeSupabaseJwt(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  return parts.every(
    (part) => /^[A-Za-z0-9_-]+$/.test(part) && part.length > 0
  );
}

function looksLikeWorkspaceApiKey(token: string): boolean {
  return /^ttr_[A-Za-z0-9_-]+$/.test(token);
}

function getBearerToken(headers: Headers) {
  const authHeader = headers.get('authorization')?.trim();
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token || null;
}

function isTrustedCliTuturuuuRateLimitBypass(
  _pathname: string,
  headers: Headers
) {
  const token = getBearerToken(headers);
  if (!token?.startsWith('ttr_app_')) {
    return false;
  }

  try {
    const verification = verifyCliAccessToken(token);
    return (
      verification.ok && isExactTuturuuuDotComEmail(verification.claims.email)
    );
  } catch {
    return false;
  }
}

function hasLikelyAuthenticatedApiCredential(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const trimmedHeader = authHeader.trim();
  if (looksLikeWorkspaceApiKey(trimmedHeader)) {
    return true;
  }

  if (!trimmedHeader.toLowerCase().startsWith('bearer ')) {
    return false;
  }

  const token = trimmedHeader.slice(7).trim();
  return looksLikeSupabaseJwt(token) || looksLikeWorkspaceApiKey(token);
}

function hasMalformedAuthorizationHeader(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return false;
  }

  const trimmedHeader = authHeader.trim();
  if (looksLikeWorkspaceApiKey(trimmedHeader)) {
    return false;
  }

  if (!trimmedHeader.toLowerCase().startsWith('bearer ')) {
    return true;
  }

  const token = trimmedHeader.slice(7).trim();
  return token.length === 0 || /\s/.test(token);
}

function buildProxyBlockResponse(
  status: 400 | 401 | 429,
  reason:
    | 'ip-already-blocked'
    | 'malformed-auth-header'
    | 'malformed-supabase-auth-cookie'
    | 'suspicious-anonymous-request',
  retryAfter?: number
) {
  const body =
    status === 429
      ? { error: 'Too Many Requests', message: 'Rate limit exceeded' }
      : status === 401
        ? { error: 'Unauthorized' }
        : { error: 'Bad Request' };

  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(retryAfter ? { 'Retry-After': `${retryAfter}` } : {}),
      'X-Proxy-Block-Reason': reason,
    },
  });
}

function applyExpiredCookies(response: NextResponse, cookieNames: string[]) {
  for (const cookieName of cookieNames) {
    response.cookies.set(cookieName, '', {
      expires: new Date(0),
      maxAge: 0,
      path: '/',
    });
  }
}

async function blockMalformedApiAuthCookieRequest(
  req: NextRequest
): Promise<NextResponse | null> {
  if (
    hasLikelyAuthenticatedApiCredential(req) ||
    isTrustedProxyBypassRequest(req.nextUrl.pathname, req.headers)
  ) {
    return null;
  }

  const malformedCookieNames = getMalformedSupabaseAuthCookieNames(
    req.cookies.getAll(),
    getRuntimePublicEnvValue('SUPABASE_URL')
  );

  if (malformedCookieNames.length === 0) {
    return null;
  }

  const ipAddress = extractIPFromRequest(req.headers);
  const existingBlock =
    ipAddress === 'unknown' ? null : await isIPBlockedEdge(ipAddress);

  if (existingBlock) {
    const retryAfter = Math.max(
      1,
      Math.ceil((existingBlock.expiresAt.getTime() - Date.now()) / 1000)
    );
    const response = buildProxyBlockResponse(
      429,
      'ip-already-blocked',
      retryAfter
    );
    applyExpiredCookies(response, malformedCookieNames);
    return response;
  }

  const newBlock =
    ipAddress === 'unknown'
      ? null
      : await recordMalformedAuthCookieEdge(ipAddress);

  if (newBlock) {
    const retryAfter = Math.max(
      1,
      Math.ceil((newBlock.expiresAt.getTime() - Date.now()) / 1000)
    );
    const response = buildProxyBlockResponse(
      429,
      'ip-already-blocked',
      retryAfter
    );
    applyExpiredCookies(response, malformedCookieNames);
    return response;
  }

  const response = buildProxyBlockResponse(
    401,
    'malformed-supabase-auth-cookie'
  );
  applyExpiredCookies(response, malformedCookieNames);
  return response;
}

function getSuspiciousAnonymousApiSignal(req: NextRequest): {
  reason: 'malformed-auth-header' | 'suspicious-anonymous-request';
  status: 400 | 401;
} | null {
  if (
    isTrustedProxyBypassRequest(req.nextUrl.pathname, req.headers) ||
    hasSupabaseSessionCookie(req)
  ) {
    return null;
  }

  if (hasMalformedAuthorizationHeader(req)) {
    return {
      reason: 'malformed-auth-header',
      status: 401,
    };
  }

  if ((req.headers.get('user-agent') ?? '').trim().length === 0) {
    return {
      reason: 'suspicious-anonymous-request',
      status: 400,
    };
  }

  if (
    req.nextUrl.search.length > SUSPICIOUS_QUERY_LENGTH_MAX ||
    req.nextUrl.searchParams.size > SUSPICIOUS_QUERY_PARAMS_MAX ||
    SCANNER_PATH_PATTERN.test(req.nextUrl.pathname)
  ) {
    return {
      reason: 'suspicious-anonymous-request',
      status: 400,
    };
  }

  return null;
}

function isExpectedHumanAuthRateLimitPath(pathname: string) {
  return (
    /^\/api\/v1\/auth\/password-login(?:\/|$)/.test(pathname) ||
    /^\/api\/v1\/auth\/mobile\/password-login(?:\/|$)/.test(pathname) ||
    /^\/api\/v1\/auth\/otp\/(?:send|verify)(?:\/|$)/.test(pathname) ||
    /^\/api\/v1\/auth\/mobile\/(?:send-otp|verify-otp)(?:\/|$)/.test(pathname)
  );
}

async function blockSuspiciousAnonymousApiRequest(
  req: NextRequest
): Promise<NextResponse | null> {
  const signal = getSuspiciousAnonymousApiSignal(req);
  if (!signal) {
    return null;
  }

  const ipAddress = extractIPFromRequest(req.headers);
  const existingBlock =
    ipAddress === 'unknown' ? null : await isIPBlockedEdge(ipAddress);

  if (existingBlock) {
    const retryAfter = Math.max(
      1,
      Math.ceil((existingBlock.expiresAt.getTime() - Date.now()) / 1000)
    );
    return buildProxyBlockResponse(429, 'ip-already-blocked', retryAfter);
  }

  const newBlock =
    ipAddress === 'unknown'
      ? null
      : await recordSuspiciousApiRequestEdge(ipAddress);

  if (newBlock) {
    const retryAfter = Math.max(
      1,
      Math.ceil((newBlock.expiresAt.getTime() - Date.now()) / 1000)
    );
    return buildProxyBlockResponse(429, 'ip-already-blocked', retryAfter);
  }

  return buildProxyBlockResponse(signal.status, signal.reason);
}

/**
 * Check if a user's personal workspace is missing an active subscription.
 * Returns true if the personal workspace exists but has no active subscription.
 * Fail-open: returns false on any error to avoid blocking users.
 */
async function personalWorkspaceMissingSubscription(
  userId: string
): Promise<boolean> {
  try {
    const supabase = await createClient();

    // Find user's personal workspace
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('creator_id', userId)
      .eq('personal', true)
      .maybeSingle();

    if (wsError || !workspace) {
      return false;
    }

    // Check for an active subscription on that workspace
    const { count, error: subError } = await supabase
      .from('workspace_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', workspace.id)
      .eq('status', 'active');

    if (subError) {
      return false;
    }

    return (count ?? 0) === 0;
  } catch {
    return false;
  }
}

/**
 * Check if user needs to complete onboarding
 * Returns true if user should be redirected to onboarding
 */
async function shouldRedirectToOnboarding(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();

    // Check onboarding progress
    const { data: progress } = await supabase
      .from('onboarding_progress')
      .select('completed_at, profile_completed')
      .eq('user_id', userId)
      .maybeSingle();

    // If onboarding is completed, no redirect needed
    if (progress?.completed_at) {
      return false;
    }

    // If no progress record exists, user needs onboarding
    if (!progress) {
      return true;
    }

    // If profile is not completed (display name not set), redirect to onboarding
    if (!progress.profile_completed) {
      return true;
    }

    // Otherwise, onboarding is in progress but not complete
    return true;
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    // On error, don't block access - let them through
    return false;
  }
}

/**
 * Check if user has completed onboarding
 * Returns true if onboarding is fully complete
 */
async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { data: progress } = await supabase
      .from('onboarding_progress')
      .select('completed_at')
      .eq('user_id', userId)
      .maybeSingle();

    return !!progress?.completed_at;
  } catch (error) {
    console.error('Error checking onboarding completion:', error);
    return false;
  }
}

/**
 * Check if the path is the onboarding page
 */
function isOnboardingPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0] || '';
  const isLocale = supportedLocales.includes(firstSegment as Locale);

  const pathWithoutLocale = isLocale
    ? `/${segments.slice(1).join('/')}`
    : pathname;

  return (
    pathWithoutLocale === '/onboarding' ||
    pathWithoutLocale.startsWith('/onboarding/')
  );
}

/**
 * Check if the current path should bypass onboarding check
 */
function shouldBypassOnboardingCheck(pathname: string): boolean {
  // Get path segments
  const segments = pathname.split('/').filter(Boolean);

  // Check if first segment is a locale
  const firstSegment = segments[0] || '';
  const isLocale = supportedLocales.includes(firstSegment as Locale);

  // Get the path without locale prefix
  const pathWithoutLocale = isLocale
    ? `/${segments.slice(1).join('/')}`
    : pathname;

  // Check against bypass paths
  return ONBOARDING_BYPASS_PATHS.some(
    (bypassPath) =>
      pathWithoutLocale.startsWith(bypassPath) ||
      pathWithoutLocale === bypassPath
  );
}

const authProxy = createCentralizedAuthProxy({
  webAppUrl: WEB_APP_URL,
  publicPaths: PUBLIC_PATHS,
  skipApiRoutes: true,
});

function getRootDynamicSegment(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  if (supportedLocales.includes((segments[0] ?? '') as Locale)) {
    return segments[1] ?? null;
  }

  return segments[0] ?? null;
}

function buildGuestRouteDeniedResponse(
  req: NextRequest,
  authRes: NextResponse
) {
  const deniedResponse = buildRootNotFoundResponse(req);
  propagateAuthCookies(authRes, deniedResponse);
  return deniedResponse;
}

function buildRootNotFoundResponse(req: NextRequest) {
  const response = new NextResponse(null, { status: 404 });
  response.headers.set('x-tuturuuu-proxy-not-found', req.nextUrl.pathname);
  return response;
}

async function guardGuestWorkspaceRoute({
  authRes,
  hasLocaleInPath,
  pathSegments,
  req,
}: {
  authRes: NextResponse;
  hasLocaleInPath: boolean;
  pathSegments: string[];
  req: NextRequest;
}): Promise<NextResponse | null> {
  const workspaceIndex = hasLocaleInPath ? 1 : 0;
  const workspaceSlug = pathSegments[workspaceIndex];

  if (
    !workspaceSlug ||
    pathSegments.length <= workspaceIndex + 1 ||
    workspaceSlug.startsWith(RESERVED_ROOT_SEGMENT_PREFIX) ||
    workspaceSlug.startsWith(BLOCKED_ROOT_SEGMENT_PREFIX) ||
    !isWorkspaceHomeRedirectCandidate(workspaceSlug)
  ) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user) {
      return null;
    }

    const resolvedWorkspaceId = await normalizeWorkspaceId(
      workspaceSlug,
      supabase
    );

    if (await isPersonalWorkspace(resolvedWorkspaceId)) {
      return null;
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId: resolvedWorkspaceId,
      userId: user.id,
      supabase,
      requiredType: 'ANY',
    });

    if (!membership.ok || membership.membershipType !== 'GUEST') {
      return null;
    }

    const requiredPermissions = getWorkspaceRoutePermissionRequirements(
      pathSegments.slice(workspaceIndex + 1)
    );

    if (!requiredPermissions) {
      return buildGuestRouteDeniedResponse(req, authRes);
    }

    const sbAdmin = await createAdminClient({ noCookie: true });
    const { data, error } = await sbAdmin
      .from('workspace_default_permissions')
      .select('permission')
      .eq('ws_id', resolvedWorkspaceId)
      .eq('member_type', 'GUEST')
      .eq('enabled', true);

    if (error) {
      return buildGuestRouteDeniedResponse(req, authRes);
    }

    const grantedPermissions = (data ?? []).map((row) => row.permission);

    if (
      !hasRequiredWorkspaceRoutePermission({
        grantedPermissions,
        requiredPermissions,
      })
    ) {
      return buildGuestRouteDeniedResponse(req, authRes);
    }

    return null;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.pathname.startsWith('/api')) {
    const malformedAuthCookieResponse =
      await blockMalformedApiAuthCookieRequest(req);
    if (malformedAuthCookieResponse) {
      return malformedAuthCookieResponse;
    }

    const suspiciousAnonymousApiResponse =
      await blockSuspiciousAnonymousApiRequest(req);
    if (suspiciousAnonymousApiResponse) {
      return suspiciousAnonymousApiResponse;
    }

    const additionalRoutePolicies = (await hasWorkspaceEmailRateLimitOverrides(
      req.nextUrl.pathname
    ))
      ? [EMAIL_RATE_LIMIT_OVERRIDE_ROUTE_POLICY]
      : undefined;

    const guardResponse = await guardApiProxyRequest(req, {
      additionalRoutePolicies,
      prefixBase: 'proxy:web:api',
      trustedBypassRules: [
        {
          matches: isTrustedCliTuturuuuRateLimitBypass,
        },
      ],
    });
    if (guardResponse) {
      if (
        guardResponse.status === 429 &&
        guardResponse.headers.get('X-Proxy-Block-Reason') ===
          'route-rate-limit' &&
        !isExpectedHumanAuthRateLimitPath(req.nextUrl.pathname) &&
        !isTrustedProxyBypassRequest(req.nextUrl.pathname, req.headers) &&
        !hasSupabaseSessionCookie(req)
      ) {
        const ipAddress = extractIPFromRequest(req.headers);
        const newBlock =
          ipAddress === 'unknown'
            ? null
            : await recordSuspiciousApiRequestEdge(ipAddress);

        if (newBlock) {
          const retryAfter = Math.max(
            1,
            Math.ceil((newBlock.expiresAt.getTime() - Date.now()) / 1000)
          );
          return buildProxyBlockResponse(429, 'ip-already-blocked', retryAfter);
        }
      }

      return guardResponse;
    }

    return NextResponse.next();
  }

  const reservedRootRouteResponse = handleReservedRootRoute(req);
  if (reservedRootRouteResponse) {
    return reservedRootRouteResponse;
  }

  // Handle authentication and MFA with the centralized middleware
  const authRes = await authProxy(req);

  // If the auth middleware returned a redirect response, return it
  if (authRes.headers.has('Location')) {
    return authRes;
  }

  // Check if user is on the onboarding page but has already completed onboarding
  // If so, redirect them to their default workspace
  if (isOnboardingPath(req.nextUrl.pathname)) {
    try {
      const supabase = await createClient();
      const { user } = await resolveAuthenticatedSessionUser(supabase);

      if (user) {
        const completed = await hasCompletedOnboarding(user.id);
        if (completed) {
          // Get user's default workspace
          const defaultWorkspace = await getUserDefaultWorkspace();
          if (defaultWorkspace) {
            const target = defaultWorkspace.personal
              ? 'personal'
              : defaultWorkspace.id === ROOT_WORKSPACE_ID
                ? 'internal'
                : defaultWorkspace.id;
            const redirectUrl = new URL(`/${target}`, req.nextUrl);
            const onboardRedirect = NextResponse.redirect(redirectUrl);
            propagateAuthCookies(authRes, onboardRedirect);
            return onboardRedirect;
          }
          // Fallback to personal if no default workspace
          const redirectUrl = new URL('/personal', req.nextUrl);
          const onboardFallback = NextResponse.redirect(redirectUrl);
          propagateAuthCookies(authRes, onboardFallback);
          return onboardFallback;
        }
      }
    } catch (error) {
      console.error(
        'Error checking onboarding completion in middleware:',
        error
      );
      // Continue with normal flow if there's an error
    }
  }

  // Check if authenticated user needs onboarding
  // This runs early to ensure users complete onboarding before accessing the platform
  if (!shouldBypassOnboardingCheck(req.nextUrl.pathname)) {
    try {
      const supabase = await createClient();
      const { user } = await resolveAuthenticatedSessionUser(supabase);

      if (user) {
        const needsOnboarding = await shouldRedirectToOnboarding(user.id);
        if (needsOnboarding) {
          const redirectUrl = new URL('/onboarding', req.nextUrl);

          // Preserve returnUrl if coming from external app login flow
          // This ensures users are redirected back to the external app after onboarding
          const returnUrl = req.nextUrl.searchParams.get('returnUrl');
          if (returnUrl) {
            redirectUrl.searchParams.set('returnUrl', returnUrl);
          }

          // Also preserve nextUrl for internal redirects
          const nextUrl = req.nextUrl.searchParams.get('nextUrl');
          if (nextUrl) {
            redirectUrl.searchParams.set('nextUrl', nextUrl);
          } else {
            // If no nextUrl param, use the current path + search params as nextUrl
            // This ensures users who land on a deep link (e.g. /finance/invoices)
            // get redirected back there after onboarding
            const currentPath = req.nextUrl.pathname + req.nextUrl.search;
            // Only set if we're not already on a root/home path to avoid infinite loops or redundancy
            if (currentPath !== '/' && currentPath !== '/login') {
              redirectUrl.searchParams.set('nextUrl', currentPath);
            }
          }

          const needsOnboardRedirect = NextResponse.redirect(redirectUrl);
          propagateAuthCookies(authRes, needsOnboardRedirect);
          return needsOnboardRedirect;
        }

        // User completed onboarding — check if their personal workspace
        // is missing a free subscription. If so, redirect to /onboarding
        // where it will be created server-side before bouncing back.
        const alreadyAttempted =
          req.cookies.get('subscription_fix_attempted')?.value === '1';

        if (!alreadyAttempted) {
          const isMissing = await personalWorkspaceMissingSubscription(user.id);

          if (isMissing) {
            const fixUrl = new URL('/onboarding', req.nextUrl);
            const response = NextResponse.redirect(fixUrl);
            response.cookies.set('subscription_fix_attempted', '1', {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 60 * 60 * 24, // 24 hours
              path: '/',
            });
            propagateAuthCookies(authRes, response);
            return response;
          }
        }
      }
    } catch (error) {
      console.error('Error checking onboarding in middleware:', error);
      // Continue with normal flow if there's an error
    }
  }

  // Handle /home path - redirect to root without workspace redirect
  const pathSegments = req.nextUrl.pathname.split('/').filter(Boolean);
  const activeLocalePrefix =
    pathSegments[0] && supportedLocales.includes(pathSegments[0] as Locale)
      ? `/${pathSegments[0]}`
      : '';
  const isHomePath =
    req.nextUrl.pathname === '/home' ||
    (pathSegments.length === 2 &&
      supportedLocales.includes(pathSegments[0] as Locale) &&
      pathSegments[1] === 'home');
  const isDashboardRootPath =
    req.nextUrl.pathname === '/dashboard' ||
    (pathSegments.length === 2 &&
      supportedLocales.includes(pathSegments[0] as Locale) &&
      pathSegments[1] === 'dashboard');

  if (isHomePath) {
    const redirectUrl = new URL('/', req.nextUrl);
    redirectUrl.searchParams.set('no-redirect', '1');
    const homeRedirect = NextResponse.redirect(redirectUrl);
    propagateAuthCookies(authRes, homeRedirect);
    return homeRedirect;
  }

  // Handle direct navigation to workspace IDs that are personal workspaces
  // Check if the path matches /[locale]/[wsId] or /[wsId] pattern where wsId is a UUID
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let potentialWorkspaceId: string | null = null;
  let hasLocaleInPath = false;

  const isRootWorkspaceSegment = (segment?: string) =>
    segment?.toLowerCase() === ROOT_WORKSPACE_ID.toLowerCase();

  if (pathSegments.length >= 1) {
    // Check if first segment is a locale
    if (
      pathSegments[0] &&
      supportedLocales.includes(pathSegments[0] as Locale)
    ) {
      hasLocaleInPath = true;
      // Check if second segment is a workspace ID
      if (pathSegments.length >= 2 && pathSegments[1]) {
        const candidate = pathSegments[1];
        if (isRootWorkspaceSegment(candidate)) {
          potentialWorkspaceId = ROOT_WORKSPACE_ID;
        } else if (uuidRegex.test(candidate)) {
          potentialWorkspaceId = candidate;
        }
      }
    } else if (pathSegments[0]) {
      // First segment is a workspace ID (no locale in path)
      if (isRootWorkspaceSegment(pathSegments[0])) {
        potentialWorkspaceId = ROOT_WORKSPACE_ID;
      } else if (uuidRegex.test(pathSegments[0])) {
        potentialWorkspaceId = pathSegments[0];
      }
    }
  }

  // Remap root workspace URL to the internal workspace slug for consistency
  if (potentialWorkspaceId === ROOT_WORKSPACE_ID) {
    const wsIdIndex = hasLocaleInPath ? 1 : 0;
    const newPathSegments = [...pathSegments];

    if (newPathSegments[wsIdIndex] !== 'internal') {
      newPathSegments[wsIdIndex] = 'internal';
      const redirectUrl = new URL(`/${newPathSegments.join('/')}`, req.nextUrl);
      redirectUrl.search = req.nextUrl.search;

      const rootRedirect = NextResponse.redirect(redirectUrl);
      propagateAuthCookies(authRes, rootRedirect);
      return rootRedirect;
    }
  }

  // If we found a potential workspace ID, check if it's a personal workspace
  if (potentialWorkspaceId) {
    try {
      const supabase = await createClient();
      const { user } = await resolveAuthenticatedSessionUser(supabase);

      if (user) {
        const isPersonal = await isPersonalWorkspace(potentialWorkspaceId);

        if (isPersonal) {
          // Construct the redirect URL replacing the workspace ID with 'personal'
          const newPathSegments = [...pathSegments];
          const wsIdIndex = hasLocaleInPath ? 1 : 0;
          newPathSegments[wsIdIndex] = 'personal';

          const redirectUrl = new URL(
            `/${newPathSegments.join('/')}`,
            req.nextUrl
          );
          // Preserve query parameters
          redirectUrl.search = req.nextUrl.search;

          const personalRedirect = NextResponse.redirect(redirectUrl);
          propagateAuthCookies(authRes, personalRedirect);
          return personalRedirect;
        }
      }
    } catch (error) {
      console.error('Error checking personal workspace in middleware:', error);
      // Continue with normal flow if there's an error
    }
  }

  const guestRouteGuardResponse = await guardGuestWorkspaceRoute({
    authRes,
    hasLocaleInPath,
    pathSegments,
    req,
  });
  if (guestRouteGuardResponse) {
    return guestRouteGuardResponse;
  }

  // Handle direct workspace home routes (/{wsId} or /{locale}/{wsId}).
  // User-configured default navigation is only applied from the app root below.
  const skipWorkspaceRedirect = req.nextUrl.searchParams.has('no-redirect');
  const isHashNavigation = req.nextUrl.searchParams.has('hash-nav');
  const isMultiAccountFlow = req.nextUrl.searchParams.has('multiAccount');
  const isDirectWorkspaceHomePath =
    (!hasLocaleInPath && pathSegments.length === 1) ||
    (hasLocaleInPath && pathSegments.length === 2);

  if (
    isDirectWorkspaceHomePath &&
    !isDashboardRootPath &&
    !skipWorkspaceRedirect &&
    !isHashNavigation &&
    !isMultiAccountFlow
  ) {
    const workspaceSlug = pathSegments[hasLocaleInPath ? 1 : 0];

    if (workspaceSlug === PERSONAL_WORKSPACE_SLUG) {
      return handleLocaleWithAuthCookies(req, authRes);
    }

    if (isWorkspaceHomeRedirectCandidate(workspaceSlug)) {
      try {
        const supabase = await createClient();
        const { user } = await resolveAuthenticatedSessionUser(supabase);

        if (user) {
          const resolvedWorkspaceId = await normalizeWorkspaceId(
            workspaceSlug,
            supabase
          );
          const memberCheck = await verifyWorkspaceMembershipType({
            wsId: resolvedWorkspaceId,
            userId: user.id,
            supabase,
            requiredType: 'ANY',
          });

          if (!memberCheck.ok) {
            return handleLocaleWithAuthCookies(req, authRes);
          }

          if (memberCheck.membershipType === 'GUEST') {
            return buildGuestRouteDeniedResponse(req, authRes);
          }
        }
      } catch (error) {
        console.error('Error handling workspace home route:', error);
      }
    }
  }

  // Handle authenticated users accessing the root path, root with locale, or
  // legacy dashboard alias.
  // Skip workspace redirect if no-redirect parameter is present (from /home redirect)
  const isRootPath = req.nextUrl.pathname === '/';

  const isLocaleRootPath =
    pathSegments.length === 1 &&
    supportedLocales.includes(pathSegments[0] as Locale);

  if (
    (isRootPath || isLocaleRootPath || isDashboardRootPath) &&
    !skipWorkspaceRedirect &&
    !isHashNavigation &&
    !isMultiAccountFlow &&
    hasSupabaseSessionCookie(req)
  ) {
    try {
      const supabase = await createClient();
      const { user } = await resolveAuthenticatedSessionUser(supabase);

      if (user) {
        const defaultWorkspace = await getUserDefaultWorkspace();

        if (defaultWorkspace) {
          const target = defaultWorkspace.personal
            ? 'personal'
            : defaultWorkspace.id === ROOT_WORKSPACE_ID
              ? 'internal'
              : defaultWorkspace.id;

          const { path, staleConfigValue } = await resolveRootRedirectPath(
            user.id,
            {
              id: defaultWorkspace.id,
              personal: defaultWorkspace.personal,
            }
          );

          const canonicalPath =
            target === defaultWorkspace.id
              ? path
              : path.replace(`/${defaultWorkspace.id}`, `/${target}`);
          const localizedCanonicalPath = prependLocalePrefix(
            canonicalPath,
            activeLocalePrefix
          );

          if (staleConfigValue !== null) {
            try {
              const sbAdmin = await createAdminClient();
              await sbAdmin.from('user_workspace_configs').upsert(
                {
                  id: ROOT_DEFAULT_NAVIGATION_CONFIG_ID,
                  user_id: user.id,
                  ws_id: defaultWorkspace.id,
                  value: staleConfigValue,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,ws_id,id' }
              );
            } catch (error) {
              console.error(
                'Failed to self-heal stale root navigation config in proxy:',
                error
              );
            }
          }

          const redirectUrl = new URL(localizedCanonicalPath, req.nextUrl);
          const wsRedirect = NextResponse.redirect(redirectUrl);
          propagateAuthCookies(authRes, wsRedirect);
          return wsRedirect;
        }
      }
    } catch (error) {
      console.error('Error handling root path redirect:', error);
    }
  }

  // Continue with locale handling
  const localeRes = handleLocale({ req });
  propagateAuthCookies(authRes, localeRes);
  return localeRes;
}

function handleLocaleWithAuthCookies(
  req: NextRequest,
  authRes: NextResponse
): NextResponse {
  const localeRes = handleLocale({ req });
  propagateAuthCookies(authRes, localeRes);
  return localeRes;
}

const handleReservedRootRoute = (req: NextRequest): NextResponse | null => {
  const { pathname } = req.nextUrl;
  const segments = pathname.split('/').filter(Boolean);
  const localizedReservedSegment = segments[1];
  const rootDynamicSegment = getRootDynamicSegment(pathname);

  if (pathname === OFFLINE_FALLBACK_PATH) {
    return NextResponse.next();
  }

  if (pathname === BROWSER_STATE_RECOVERY_PATH) {
    return NextResponse.next();
  }

  if (rootDynamicSegment?.startsWith(BLOCKED_ROOT_SEGMENT_PREFIX)) {
    return buildRootNotFoundResponse(req);
  }

  if (segments[0]?.startsWith(RESERVED_ROOT_SEGMENT_PREFIX)) {
    return buildRootNotFoundResponse(req);
  }

  if (
    supportedLocales.includes((segments[0] ?? '') as Locale) &&
    localizedReservedSegment?.startsWith(RESERVED_ROOT_SEGMENT_PREFIX)
  ) {
    const canonicalReservedPath =
      localizedReservedSegment === OFFLINE_FALLBACK_PATH.slice(1)
        ? OFFLINE_FALLBACK_PATH
        : localizedReservedSegment === BROWSER_STATE_RECOVERY_PATH.slice(1)
          ? BROWSER_STATE_RECOVERY_PATH
          : `/${segments.slice(1).join('/')}`;
    const redirectUrl = new URL(canonicalReservedPath, req.nextUrl);
    redirectUrl.search = req.nextUrl.search;
    return NextResponse.redirect(redirectUrl);
  }

  return null;
};

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt (SEO)
     * - sitemap.xml (SEO)
     * - site.webmanifest (legacy PWA manifest)
     * - manifest.webmanifest (PWA manifest generated by Next.js)
     * - sw.js (service worker)
     * - monitoring (analytics)
     * - .well-known (domain verification files)
     * Excludes files with the following extensions for static assets:
     * - svg
     * - png
     * - jpg
     * - jpeg
     * - mp3
     * - wav
     * - ogg
     * - m4a
     * - pdf
     * - gif
     * - webp
     */

    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|site.webmanifest|manifest.webmanifest|sw.js|serwist|monitoring|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|mp3|wav|ogg|m4a|pdf|gif|webp)$).*)',
  ],
};

const getSupportedLocale = (locale: string): Locale | null => {
  return supportedLocales.includes(locale as Locale)
    ? (locale as Locale)
    : null;
};

const getExistingLocale = (
  req: NextRequest
): {
  locale: Locale | null;
  cookie: string | null;
  pathname: string | null;
} => {
  // Get raw locale from pathname and cookie
  const rawLocaleFromPathname = req.nextUrl.pathname.split('/')[1] || '';
  const rawRocaleFromCookie = req.cookies.get(LOCALE_COOKIE_NAME)?.value || '';

  // Get supported locale from pathname and cookie
  const localeFromPathname = getSupportedLocale(rawLocaleFromPathname);
  const localeFromCookie = getSupportedLocale(rawRocaleFromCookie);

  const locale = localeFromPathname || localeFromCookie;

  return {
    locale,
    cookie: localeFromCookie,
    pathname: localeFromPathname,
  };
};

const getDefaultLocale = (
  req: NextRequest
): {
  locale: Locale;
} => {
  // Get browser languages
  const headers = {
    'accept-language': req.headers.get('accept-language') ?? 'en-US,en;q=0.5',
  };

  const languages = new Negotiator({ headers })
    .languages()
    .flatMap((language) => {
      if (!language || language === '*') {
        return [];
      }

      try {
        const [canonicalLocale] = Intl.getCanonicalLocales(language);
        return canonicalLocale ? [canonicalLocale] : [];
      } catch {
        return [];
      }
    });

  let detectedLocale: string = defaultLocale;

  try {
    detectedLocale = match(
      languages.length > 0 ? languages : [defaultLocale],
      supportedLocales,
      defaultLocale
    );
  } catch {
    detectedLocale = defaultLocale;
  }

  return {
    locale: supportedLocales.includes(detectedLocale as Locale)
      ? (detectedLocale as Locale)
      : defaultLocale,
  };
};

const getLocale = (
  req: NextRequest
): {
  locale: string;
  cookie: string | null;
  pathname: string | null;
  default: boolean;
} => {
  // Get locale from pathname and cookie
  const { locale: existingLocale, cookie, pathname } = getExistingLocale(req);

  // If locale is found, return it
  if (existingLocale) {
    return {
      locale: existingLocale,
      cookie,
      pathname,
      default: false,
    };
  }

  // If locale is not found, return default locale
  const { locale: defaultLocale } = getDefaultLocale(req);

  return {
    locale: defaultLocale,
    cookie,
    pathname,
    default: true,
  };
};

const handleLocale = ({ req }: { req: NextRequest }): NextResponse => {
  // Get locale from cookie or browser languages
  const { locale } = getLocale(req);

  const nextIntlMiddleware = createIntlMiddleware({
    locales: supportedLocales,
    defaultLocale: locale as Locale,
    localeDetection: false,
    localePrefix: 'as-needed',
  });

  return nextIntlMiddleware(req);
};
