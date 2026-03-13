import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  extractIPFromHeaders,
  isIPBlocked,
  recordApiAuthFailure,
} from '@tuturuuu/utils/abuse-protection';
import { MAX_PAYLOAD_SIZE } from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, type RateLimitConfig } from './rate-limit';

export type AuthorizedRequest = {
  user: SupabaseUser;
  supabase: TypedSupabaseClient;
};

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
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      data: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { data: { user, supabase }, error: null };
}

/**
 * @deprecated Use `withSessionAuth` instead for new routes.
 */
export async function authorize(
  wsId: string
): Promise<{ user: SupabaseUser | null; error: NextResponse | null }> {
  const supabase = (await createClient()) as TypedSupabaseClient;
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

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

  const { data: memberCheck, error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .single();

  if (memberError) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }

  if (!memberCheck) {
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

interface SessionAuthContext {
  user: SupabaseUser;
  supabase: TypedSupabaseClient;
}

interface CacheConfig {
  /** Browser cache max-age in seconds. Only applied to 2xx GET responses. */
  maxAge: number;
  /** stale-while-revalidate window in seconds (optional). */
  swr?: number;
}

type SessionAuthRateLimitKind = 'method' | 'read' | 'mutate';

/** Default rate limits — reads stay open, mutations remain strict. */
const DEFAULT_MUTATE_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 20,
};

interface SessionAuthOptions {
  /**
   * IP-based rate limit config. Overrides the method-aware defaults.
   * Defaults: GET/HEAD are not rate-limited, mutations → 20 req/min.
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

    // 2. Check persistent IP block
    if (ipAddress && ipAddress !== 'unknown') {
      const blockInfo = await isIPBlocked(ipAddress);
      if (blockInfo) {
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

    // 4. Authenticate — the expensive Supabase `getUser()` call
    const supabase = (await createClient(request)) as TypedSupabaseClient;
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

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

    return response;
  };
}
