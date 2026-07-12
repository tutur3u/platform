import {
  type AppSessionTargetApp,
  attachSupabaseAuthUser,
  createAppSessionUser,
  getAppSessionTokenFromRequest,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import {
  CLI_APP_ACCESS_SCOPE,
  CLI_APP_TARGET_APP,
} from '@tuturuuu/auth/cli-session';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  type BlockInfo,
  buildAbuseRiskSubjects,
  extractIPFromHeaders,
  isIPBlocked,
  recordApiAuthFailure,
} from '@tuturuuu/utils/abuse-protection';
import {
  cascadeBackendRateLimitToProxyBan,
  isBackendRateLimitError,
} from '@tuturuuu/utils/abuse-protection/backend-rate-limit';
import { writeVerifiedSessionCacheForSubjects } from '@tuturuuu/utils/abuse-protection/edge-trust';
import { validateAiTempAuthRequest } from '@tuturuuu/utils/ai-temp-auth';
import { hasAuthenticatedApiSession } from '@tuturuuu/utils/api-proxy-guard';
import { MAX_PAYLOAD_SIZE } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import {
  enforceAdaptiveStepUpChallenge,
  getAdaptiveRateLimitConfig,
  recordResponseAbuseSignal,
  resolveWebAbuseDecision,
} from './abuse-risk';
import { setLogDrainUserContext } from './infrastructure/log-drain';
import { checkRateLimit, type RateLimitConfig } from './rate-limit';

export type AuthorizedRequest = {
  user: SupabaseUser;
  supabase: TypedSupabaseClient;
};

function buildIpBlockResponse(blockInfo: BlockInfo) {
  const retryAfter = Math.max(
    1,
    Math.ceil((blockInfo.expiresAt.getTime() - Date.now()) / 1000)
  );

  return NextResponse.json(
    { error: 'Too Many Requests', message: 'Rate limit exceeded' },
    {
      status: 429,
      headers: { 'Retry-After': `${retryAfter}` },
    }
  );
}

function writeVerifiedSessionCacheForRequest(
  request: Pick<NextRequest, 'headers'>,
  userId: string
) {
  const subjects = buildAbuseRiskSubjects({
    headers: request.headers,
    ipAddress: extractIPFromHeaders(request.headers),
    userId,
  });
  const sessionSubjectKeys = subjects
    .filter((subject) => subject.subject_type === 'session')
    .map((subject) => subject.subject_key);

  if (sessionSubjectKeys.length > 0) {
    void writeVerifiedSessionCacheForSubjects(sessionSubjectKeys);
  }
}

/**
 * @deprecated Use `withSessionAuth` instead for new routes.
 * Kept for backward compatibility during migration.
 */
export async function authorizeRequest(
  request: Pick<NextRequest, 'headers' | 'url'>
): Promise<{ data: AuthorizedRequest | null; error: NextResponse | null }> {
  // Check payload size
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > MAX_PAYLOAD_SIZE) {
      return {
        data: null,
        error: NextResponse.json(
          { error: 'Payload Too Large', message: 'Request body exceeds limit' },
          { status: 413 }
        ),
      };
    }
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const { user, authError } = await resolveAuthenticatedUser(supabase);

  if (authError || !user) {
    return {
      data: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  writeVerifiedSessionCacheForRequest(request, user.id);

  return { data: { user, supabase }, error: null };
}

/**
 * @deprecated Use `withSessionAuth` instead for new routes.
 */
export async function authorize(
  wsId: string
): Promise<{ user: SupabaseUser | null; error: NextResponse | null }> {
  const supabase = (await createClient()) as TypedSupabaseClient;
  const { user, authError: userError } =
    await resolveAuthenticatedUser(supabase);

  if (userError) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }

  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: user.id,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      ),
    };
  }
  return { user, error: null };
}

// ---------------------------------------------------------------------------
// withSessionAuth — rate-limited session-auth wrapper
// ---------------------------------------------------------------------------

export interface SessionAuthContext {
  user: SupabaseUser;
  supabase: TypedSupabaseClient;
}

type StrictAppSessionAuthOptions = {
  requiredScope?: string | false;
  targetApp?: AppSessionTargetApp | readonly AppSessionTargetApp[];
};

type AppSessionAuthOptions =
  | boolean
  | StrictAppSessionAuthOptions
  | readonly StrictAppSessionAuthOptions[];

const LEARN_TEACH_APP_SESSION_TARGETS = ['learn', 'teach'] as const;
const ALL_SATELLITE_APP_SESSION_TARGETS = [
  'calendar',
  'chat',
  'cms',
  'contacts',
  'drive',
  'finance',
  'hive',
  'inventory',
  'learn',
  'mail',
  'mind',
  'mira',
  'nova',
  'pay',
  'rewise',
  'storefront',
  'tasks',
  'teach',
  'track',
] as const;

const APP_SESSION_ROUTE_AUDIENCE_RULES: readonly {
  pattern: RegExp;
  targetApp: AppSessionTargetApp | readonly AppSessionTargetApp[];
}[] = [
  {
    pattern: /^\/api\/v1\/ai\/whitelist(?:\/|$)/u,
    targetApp: ALL_SATELLITE_APP_SESSION_TARGETS,
  },
  { pattern: /^\/api\/v1\/ai\/chats(?:\/|$)/u, targetApp: 'rewise' },
  { pattern: /^\/api\/v1\/cms(?:\/|$)/u, targetApp: 'cms' },
  { pattern: /^\/api\/v1\/nova(?:\/|$)/u, targetApp: 'nova' },
  {
    pattern: /^\/api\/v1\/(?:course|tulearn)(?:\/|$)/u,
    targetApp: LEARN_TEACH_APP_SESSION_TARGETS,
  },
  {
    pattern:
      /^\/api\/v1\/users\/me\/(?:avatar|configs|default-workspace|email|profile)(?:\/|$)/u,
    targetApp: ALL_SATELLITE_APP_SESSION_TARGETS,
  },
  {
    pattern:
      /^\/api\/v1\/workspaces\/[^/]+\/(?:calendar|calendar-hours|calendar-settings|encryption)(?:\/|$)/u,
    targetApp: 'calendar',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/chat(?:\/|$)/u,
    targetApp: 'chat',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/storage(?:\/|$)/u,
    targetApp: 'drive',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/time-tracking(?:\/|$)/u,
    targetApp: ['calendar', 'track'],
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/inventory(?:\/|$)/u,
    targetApp: 'inventory',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/mail(?:\/|$)/u,
    targetApp: 'mail',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/mind(?:\/|$)/u,
    targetApp: 'mind',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/tulearn(?:\/|$)/u,
    targetApp: LEARN_TEACH_APP_SESSION_TARGETS,
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/teach(?:\/|$)/u,
    targetApp: 'teach',
  },
  {
    pattern:
      /^\/api\/v1\/workspaces\/[^/]+\/(?:courses|course-modules)(?:\/|$)/u,
    targetApp: 'teach',
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/users\/groups(?:\/|$)/u,
    targetApp: ['contacts', 'teach'],
  },
  {
    pattern: /^\/api\/v1\/workspaces\/[^/]+\/users(?:\/|$)/u,
    targetApp: ['contacts', 'teach'],
  },
  {
    pattern:
      /^\/api\/v1\/workspaces\/[^/]+\/user-groups\/[^/]+\/(?:module-groups|module-order|modules)(?:\/|$)/u,
    targetApp: 'teach',
  },
];

function getPathnameFromRequestUrl(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split('?')[0] || '/';
  }
}

export function getDefaultAppSessionVerificationOptions(
  requestUrl: string
): StrictAppSessionAuthOptions {
  const pathname = getPathnameFromRequestUrl(requestUrl);
  const audienceRule = APP_SESSION_ROUTE_AUDIENCE_RULES.find((rule) =>
    rule.pattern.test(pathname)
  );

  return {
    targetApp: audienceRule?.targetApp ?? 'platform',
  };
}

function getAppSessionVerificationOptions(
  request: Pick<NextRequest, 'url'>,
  allowAppSessionAuth:
    | true
    | StrictAppSessionAuthOptions
    | readonly StrictAppSessionAuthOptions[]
): readonly StrictAppSessionAuthOptions[] {
  if (allowAppSessionAuth === true) {
    return [getDefaultAppSessionVerificationOptions(request.url)];
  }

  return isAppSessionAuthOptionsList(allowAppSessionAuth)
    ? allowAppSessionAuth
    : [allowAppSessionAuth];
}

function isAppSessionAuthOptionsList(
  value: StrictAppSessionAuthOptions | readonly StrictAppSessionAuthOptions[]
): value is readonly StrictAppSessionAuthOptions[] {
  return Array.isArray(value);
}

function verifyConfiguredAppSessionRequest(
  request: Pick<NextRequest, 'headers' | 'url'>,
  allowAppSessionAuth:
    | true
    | StrictAppSessionAuthOptions
    | readonly StrictAppSessionAuthOptions[]
): Extract<ReturnType<typeof verifyAppSessionRequest>, { ok: true }> | null {
  for (const verificationOptions of getAppSessionVerificationOptions(
    request,
    allowAppSessionAuth
  )) {
    const verification = verifyAppSessionRequest(request, verificationOptions);

    if (verification.ok) {
      return verification;
    }
  }

  return null;
}

async function resolveAuthenticatedUser(supabase: TypedSupabaseClient) {
  const resolution = await resolveAuthenticatedSessionUser(supabase);
  if (resolution.user) {
    setLogDrainUserContext({
      userEmail: resolution.user.email,
      userId: resolution.user.id,
    });
  }
  return resolution;
}

export type SessionAuthResolution =
  | (SessionAuthContext & {
      ok: true;
    })
  | {
      ok: false;
      response: NextResponse;
    };

export async function resolveSessionAuthContext(
  request: Pick<NextRequest, 'headers' | 'url'>,
  options?: Pick<SessionAuthOptions, 'allowAppSessionAuth'>
): Promise<SessionAuthResolution> {
  if (options?.allowAppSessionAuth) {
    const appSessionToken = getAppSessionTokenFromRequest(request);

    if (appSessionToken) {
      const appSessionVerification = verifyConfiguredAppSessionRequest(
        request,
        options.allowAppSessionAuth
      );

      if (!appSessionVerification) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          ),
        };
      }

      const appSessionUser = createAppSessionUser(
        appSessionVerification.claims
      );
      setLogDrainUserContext({
        userEmail: appSessionUser.email,
        userId: appSessionUser.id,
      });

      writeVerifiedSessionCacheForRequest(request, appSessionUser.id);

      return {
        ok: true,
        supabase: attachSupabaseAuthUser(
          (await createAdminClient({
            noCookie: true,
          })) as TypedSupabaseClient,
          appSessionUser
        ),
        user: appSessionUser,
      };
    }
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const { user, authError } = await resolveAuthenticatedUser(supabase);

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  writeVerifiedSessionCacheForRequest(request, user.id);

  return {
    ok: true,
    supabase,
    user,
  };
}

interface CacheConfig {
  /** Browser cache max-age in seconds. Only applied to 2xx GET responses. */
  maxAge: number;
  /** stale-while-revalidate window in seconds (optional). */
  swr?: number;
}

type SessionAuthRateLimitKind = 'method' | 'read' | 'mutate';

/** Default rate limits — reads stay open, mutations allow a moderate burst. */
const DEFAULT_MUTATE_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 60,
};

interface SessionAuthOptions {
  /**
   * IP-based rate limit config. Overrides the method-aware defaults.
   * Defaults: GET/HEAD are not rate-limited, mutations → 60 req/min.
   * Set `false` to disable rate limiting entirely (not recommended).
   */
  rateLimit?: RateLimitConfig | false;
  /**
   * Classifies the route for rate limiting.
   * Defaults to `method`, which maps GET/HEAD → read and everything else → mutate.
   * Use `read` for read-only POST endpoints that need a request body.
   */
  rateLimitKind?: SessionAuthRateLimitKind;
  /**
   * Cache-Control header for successful GET responses.
   * Always uses `private` (browser-only, never CDN-cached) since these are
   * authenticated endpoints. Mutations (POST/PUT/DELETE) are never cached.
   */
  cache?: CacheConfig;
  /**
   * Maximum allowed payload size in bytes.
   * Defaults to MAX_PAYLOAD_SIZE (1MB).
   */
  maxPayloadSize?: number;
  /**
   * Allows short-lived Redis-backed AI temp auth before falling back to
   * Supabase session auth. Keep this scoped to AI routes only.
   */
  allowAiTempAuth?: boolean;
  /**
   * Allows registered internal apps to authenticate with a Tuturuuu-managed
   * app-session JWT. Handlers opting into this path must keep authorization
   * explicit because the Supabase client is admin-backed.
   */
  allowAppSessionAuth?: AppSessionAuthOptions;
  /**
   * Allows verified app-session requests to skip browser step-up challenges.
   * Use only for server-to-server routes that are protected by explicit scopes.
   */
  skipAppSessionStepUpChallenge?: boolean;
}

type SessionAdaptiveAuthKind = 'app-session' | 'session' | 'temp';

function isCliAppSessionClaims(claims: {
  origin_app?: string | null;
  scopes?: readonly string[];
  target_app?: string | null;
}) {
  return (
    claims.origin_app === 'cli' &&
    claims.target_app === CLI_APP_TARGET_APP &&
    claims.scopes?.includes(CLI_APP_ACCESS_SCOPE) === true
  );
}

function getUserCreatedAt(user: SupabaseUser) {
  return (user as SupabaseUser & { created_at?: string | null }).created_at;
}

async function applyAdaptiveSessionControls({
  authKind,
  endpoint,
  ipAddress,
  isRead,
  rateLimit,
  request,
  skipStepUpChallenge = false,
  user,
}: {
  authKind: SessionAdaptiveAuthKind;
  endpoint: string;
  ipAddress: string;
  isRead: boolean;
  rateLimit: RateLimitConfig | false | undefined;
  request: NextRequest;
  skipStepUpChallenge?: boolean;
  user: SupabaseUser;
}): Promise<{
  decision: Awaited<ReturnType<typeof resolveWebAbuseDecision>>;
  headers: Record<string, string>;
  response: NextResponse | null;
}> {
  const decision = await resolveWebAbuseDecision({
    authKind,
    ipAddress,
    isRead,
    method: request.method,
    request,
    route: endpoint,
    userCreatedAt: getUserCreatedAt(user),
    userId: user.id,
  });

  if (!skipStepUpChallenge) {
    const challengeResponse = await enforceAdaptiveStepUpChallenge({
      decision,
      ipAddress,
      isRead,
      method: request.method,
      request,
      route: endpoint,
      userId: user.id,
    });

    if (challengeResponse) {
      return { decision, headers: {}, response: challengeResponse };
    }
  }

  const config = rateLimit ?? (isRead ? false : DEFAULT_MUTATE_RATE_LIMIT);
  if (rateLimit === false || config === false) {
    return { decision, headers: {}, response: null };
  }

  const { config: adaptiveConfig } = getAdaptiveRateLimitConfig(
    config,
    decision
  );
  const rateLimitResult = await checkRateLimit(
    `session:user:${isRead ? 'read' : 'mutate'}:${user.id}`,
    adaptiveConfig
  );

  if (!('allowed' in rateLimitResult)) {
    recordResponseAbuseSignal({
      decision,
      ipAddress,
      method: request.method,
      response: rateLimitResult,
      route: endpoint,
      userId: user.id,
    });
    return { decision, headers: {}, response: rateLimitResult };
  }

  return {
    decision,
    headers: rateLimitResult.headers,
    response: null,
  };
}

function applyAdaptiveRateLimitHeaders(
  response: NextResponse,
  headers: Record<string, string>
) {
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
}

/**
 * Wraps a session-auth route handler with:
 * 1. IP block check (cheap Redis lookup)
 * 2. IP rate limit — BEFORE the expensive `getUser()` call
 * 3. Supabase `getUser()` authentication
 * 4. On 401: records auth failure for auto-blocking
 * 5. User suspension check (returns 403 if suspended)
 * 6. Calls the actual handler
 *
 * @example
 * export const GET = withSessionAuth(async (req, { user, supabase }) => {
 *   return NextResponse.json({ userId: user.id });
 * });
 */
export function withSessionAuth<T = unknown>(
  handler: (
    request: NextRequest,
    context: SessionAuthContext,
    params: T
  ) => Promise<NextResponse> | NextResponse,
  options?: SessionAuthOptions
): (
  request: NextRequest,
  routeContext?: { params?: Promise<T> | T }
) => Promise<NextResponse> {
  return async (
    request: NextRequest,
    routeContext?: { params?: Promise<T> | T }
  ) => {
    const url = new URL(request.url);
    const endpoint = url.pathname;
    const isRead =
      options?.rateLimitKind === 'read'
        ? true
        : options?.rateLimitKind === 'mutate'
          ? false
          : request.method === 'GET' || request.method === 'HEAD';

    // 0. Check payload size
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      const limit = options?.maxPayloadSize ?? MAX_PAYLOAD_SIZE;

      if (size > limit) {
        return NextResponse.json(
          { error: 'Payload Too Large', message: 'Request body exceeds limit' },
          { status: 413 }
        );
      }
    }

    // 1. Extract IP
    const ipAddress = extractIPFromHeaders(request.headers);

    let deferredApiAbuseBlock: BlockInfo | null = null;

    // 2. Check persistent IP block
    if (ipAddress && ipAddress !== 'unknown') {
      const blockInfo = await isIPBlocked(ipAddress, {
        route: endpoint,
        source: 'api-auth',
      });
      if (blockInfo) {
        const authenticatedSessionMarker = hasAuthenticatedApiSession(request);

        // Proxy-side anonymous abuse blocks should not lock out valid signed-in
        // sessions, but syntactic auth markers are not trusted by themselves.
        // Defer api_abuse blocks only long enough to validate route auth.
        if (blockInfo.reason === 'api_abuse' && authenticatedSessionMarker) {
          deferredApiAbuseBlock = blockInfo;
        } else {
          return buildIpBlockResponse(blockInfo);
        }
      }

      // 3. IP rate limit BEFORE auth — method-aware defaults + separate keys
      if (options?.rateLimit !== false) {
        const config =
          options?.rateLimit ?? (isRead ? false : DEFAULT_MUTATE_RATE_LIMIT);

        if (config !== false) {
          const rateLimitResult = await checkRateLimit(
            `session:ip:${isRead ? 'read' : 'mutate'}:${ipAddress}`,
            config
          );
          if (!('allowed' in rateLimitResult)) {
            return rateLimitResult;
          }
        }
      }
    }

    // 4. Authenticate — use Redis temp auth or app-session JWTs when present,
    // otherwise revalidate the Supabase session with `getUser()`.
    const tempAuth = options?.allowAiTempAuth
      ? await validateAiTempAuthRequest(request)
      : { status: 'missing' as const };

    if (tempAuth.status === 'revoked') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (tempAuth.status === 'valid') {
      const tempUser = tempAuth.context.user as SupabaseUser;
      const tempSupabase = (await createClient(request)) as TypedSupabaseClient;
      setLogDrainUserContext({
        userEmail: tempUser.email,
        userId: tempUser.id,
      });

      try {
        const { checkUserSuspension } = await import(
          '@tuturuuu/utils/abuse-protection/user-suspension'
        );
        const suspension = await checkUserSuspension(tempUser.id);
        if (suspension.suspended) {
          return NextResponse.json(
            {
              error: 'Forbidden',
              message: suspension.reason ?? 'Account suspended',
            },
            { status: 403 }
          );
        }
      } catch {
        // User suspension module not yet available or failed — fail-open
      }

      const adaptiveControls = await applyAdaptiveSessionControls({
        authKind: 'temp',
        endpoint,
        ipAddress,
        isRead,
        rateLimit: options?.rateLimit,
        request,
        user: tempUser,
      });
      if (adaptiveControls.response) {
        return adaptiveControls.response;
      }

      const response = await handler(
        request,
        { user: tempUser, supabase: tempSupabase },
        routeContext?.params
          ? await Promise.resolve(routeContext.params)
          : ({} as T)
      );

      if (
        options?.cache &&
        request.method === 'GET' &&
        response.status >= 200 &&
        response.status < 300
      ) {
        const { maxAge, swr } = options.cache;
        const directives = [`private`, `max-age=${maxAge}`];
        if (swr !== undefined) {
          directives.push(`stale-while-revalidate=${swr}`);
        }
        response.headers.set('Cache-Control', directives.join(', '));
      }

      applyAdaptiveRateLimitHeaders(response, adaptiveControls.headers);
      recordResponseAbuseSignal({
        decision: adaptiveControls.decision,
        ipAddress,
        method: request.method,
        response,
        route: endpoint,
        userId: tempUser.id,
      });

      return response;
    }

    if (options?.allowAppSessionAuth) {
      const appSessionToken = getAppSessionTokenFromRequest(request);

      if (appSessionToken) {
        const appSessionVerification = verifyConfiguredAppSessionRequest(
          request,
          options.allowAppSessionAuth
        );

        if (!appSessionVerification) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const appSessionUser = createAppSessionUser(
          appSessionVerification.claims
        );
        setLogDrainUserContext({
          userEmail: appSessionUser.email,
          userId: appSessionUser.id,
        });

        try {
          const { checkUserSuspension } = await import(
            '@tuturuuu/utils/abuse-protection/user-suspension'
          );
          const suspension = await checkUserSuspension(appSessionUser.id);
          if (suspension.suspended) {
            return NextResponse.json(
              {
                error: 'Forbidden',
                message: suspension.reason ?? 'Account suspended',
              },
              { status: 403 }
            );
          }
        } catch {
          // User suspension module not yet available or failed — fail-open
        }

        const adminSupabase = (await createAdminClient({
          noCookie: true,
        })) as TypedSupabaseClient;
        const appSessionSupabase = attachSupabaseAuthUser(
          adminSupabase,
          appSessionUser
        );
        const params = routeContext?.params
          ? await Promise.resolve(routeContext.params)
          : ({} as T);
        const adaptiveControls = await applyAdaptiveSessionControls({
          authKind: 'app-session',
          endpoint,
          ipAddress,
          isRead,
          rateLimit: options?.rateLimit,
          request,
          skipStepUpChallenge:
            options?.skipAppSessionStepUpChallenge === true ||
            isCliAppSessionClaims(appSessionVerification.claims),
          user: appSessionUser,
        });
        if (adaptiveControls.response) {
          return adaptiveControls.response;
        }

        const response = await handler(
          request,
          { user: appSessionUser, supabase: appSessionSupabase },
          params
        );

        if (
          options?.cache &&
          request.method === 'GET' &&
          response.status >= 200 &&
          response.status < 300
        ) {
          const { maxAge, swr } = options.cache;
          const directives = [`private`, `max-age=${maxAge}`];
          if (swr !== undefined) {
            directives.push(`stale-while-revalidate=${swr}`);
          }
          response.headers.set('Cache-Control', directives.join(', '));
        }

        applyAdaptiveRateLimitHeaders(response, adaptiveControls.headers);
        recordResponseAbuseSignal({
          decision: adaptiveControls.decision,
          ipAddress,
          method: request.method,
          response,
          route: endpoint,
          userId: appSessionUser.id,
        });

        return response;
      }
    }

    const supabase = (await createClient(request)) as TypedSupabaseClient;
    const { user, authError } = await resolveAuthenticatedUser(supabase);

    if (deferredApiAbuseBlock && (authError || !user)) {
      return buildIpBlockResponse(deferredApiAbuseBlock);
    }

    if (isBackendRateLimitError(authError)) {
      const blockInfo = await cascadeBackendRateLimitToProxyBan({
        endpoint,
        ipAddress,
        source: 'auth',
      });
      const retryAfter = blockInfo
        ? Math.max(
            1,
            Math.ceil((blockInfo.expiresAt.getTime() - Date.now()) / 1000)
          )
        : 60;

      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded' },
        {
          status: 429,
          headers: { 'Retry-After': `${retryAfter}` },
        }
      );
    }

    if (authError || !user) {
      // Record auth failure for auto-blocking
      if (ipAddress && ipAddress !== 'unknown') {
        void recordApiAuthFailure(ipAddress, endpoint);
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 5. Check user suspension
    try {
      const { checkUserSuspension } = await import(
        '@tuturuuu/utils/abuse-protection/user-suspension'
      );
      const suspension = await checkUserSuspension(user.id);
      if (suspension.suspended) {
        return NextResponse.json(
          {
            error: 'Forbidden',
            message: suspension.reason ?? 'Account suspended',
          },
          { status: 403 }
        );
      }
    } catch {
      // User suspension module not yet available or failed — fail-open
    }

    // 6. Resolve route params and call handler
    const params = routeContext?.params
      ? await Promise.resolve(routeContext.params)
      : ({} as T);

    const adaptiveControls = await applyAdaptiveSessionControls({
      authKind: 'session',
      endpoint,
      ipAddress,
      isRead,
      rateLimit: options?.rateLimit,
      request,
      user,
    });
    if (adaptiveControls.response) {
      return adaptiveControls.response;
    }

    const response = await handler(request, { user, supabase }, params);

    // 7. Apply Cache-Control for successful GET responses
    if (
      options?.cache &&
      request.method === 'GET' &&
      response.status >= 200 &&
      response.status < 300
    ) {
      const { maxAge, swr } = options.cache;
      const directives = [`private`, `max-age=${maxAge}`];
      if (swr !== undefined) {
        directives.push(`stale-while-revalidate=${swr}`);
      }
      response.headers.set('Cache-Control', directives.join(', '));
    }

    applyAdaptiveRateLimitHeaders(response, adaptiveControls.headers);
    recordResponseAbuseSignal({
      decision: adaptiveControls.decision,
      ipAddress,
      method: request.method,
      response,
      route: endpoint,
      userId: user.id,
    });

    return response;
  };
}
