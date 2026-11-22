import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare/cloudflare-context';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  createAdminClient,
  getBearerAccessToken,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { checkCsrf } from '@tuturuuu/auth/csrf';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { mfaProofFromVerifiedClaims } from '@tuturuuu/utils/required-mfa-policy';
import { checkRequiredAccountMfa } from '@tuturuuu/utils/required-mfa-request';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { isFreshMfaProof } from '@/lib/auth/mfa-proof-age';
import { checkRateLimitRedis } from '@/lib/rate-limit';
import type { CronControlBinding } from './cron-control-relay';

export const CRON_RELAY_NO_STORE = { 'cache-control': 'private, no-store' };
/** A resume needs a second-factor check of this session this recent. */
export const CRON_RESUME_MFA_MAX_AGE_SECONDS = 15 * 60;

export function cronRelayError(error: string, status: number) {
  // Closed-set reason only; request content is never echoed or logged.
  if (status >= 500) console.warn('Cron Control relay failed', { error });
  return NextResponse.json({ error }, { status, headers: CRON_RELAY_NO_STORE });
}

/** Web's CRON_CONTROL service binding (api-core only), or null. */
export function cronControlBinding(): CronControlBinding | null {
  try {
    const env = getCloudflareContext().env as {
      CRON_CONTROL?: CronControlBinding;
    };
    return env.CRON_CONTROL ?? null;
  } catch {
    return null;
  }
}

/**
 * Platform operators only: the root workspace's `manage_workspace_secrets`
 * permission, the gate the other root infrastructure controls use.
 */
export async function isCronOperator(user: SupabaseUser) {
  try {
    const permissions = await getPermissions({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });
    return permissions?.containsPermission('manage_workspace_secrets') ?? false;
  } catch {
    return false;
  }
}

const LIMITS = {
  read: { windowMs: 60_000, maxRequests: 30 },
  resume: { windowMs: 60_000, maxRequests: 6 },
} as const;

type Principal = { user: SupabaseUser; supabase: TypedSupabaseClient };

/**
 * Same-origin proof for a resume that carries a session cookie, whatever the
 * global CSRF rollout mode. Stricter than the proxy's check: only this
 * request's own origin counts, with no satellite or same-site exception. A
 * cookie-less bearer request (an operator's terminal) is exempt.
 */
function refuseCrossOrigin(request: NextRequest) {
  const verdict = checkCsrf({
    allowedOrigins: [request.nextUrl.origin],
    bearerRequiresNoSessionCookie: true,
    headers: request.headers,
    method: request.method,
    pathname: request.nextUrl.pathname,
  });
  if (verdict.ok) return null;
  console.warn('Cron Control resume refused: not same-origin', {
    reason: verdict.reason,
  });
  return NextResponse.json(
    { code: 'CSRF_REJECTED', error: 'Cross-origin request rejected' },
    { status: 403, headers: CRON_RELAY_NO_STORE }
  );
}

/**
 * The operator's own counter for this action, apart from the shared mutation
 * counters. Fails closed: without the counter store nothing is relayed.
 */
async function refuseOverLimit(action: 'read' | 'resume', userId: string) {
  const result = await checkRateLimitRedis(
    `cron-control:${action}:user:${userId.toLowerCase()}`,
    LIMITS[action],
    { failClosed: true }
  );
  if (result.allowed) return null;
  if (result.unavailable) return cronRelayError('unavailable', 503);
  const retryAfter = Math.max(1, result.reset - Math.floor(Date.now() / 1000));
  return NextResponse.json(
    { error: 'rate_limited', retryAfter },
    {
      status: 429,
      headers: { ...CRON_RELAY_NO_STORE, 'retry-after': String(retryAfter) },
    }
  );
}

/**
 * The second-factor standing of the provider session that authenticated this
 * request, and nothing else. Both the platform's account policy (a recovery,
 * a removed factor, a banned account) and the proof age are read from the
 * credential `withSessionAuth` admitted: the bearer the client was built
 * from, or else its cookie session. An app session token riding on the same
 * request is never consulted, so another session of the same operator cannot
 * lend its standing or its proof.
 */
async function sessionAssurance(
  request: NextRequest,
  principal: Principal,
  maxAgeSeconds: number | null,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<'allowed' | 'required' | 'unavailable'> {
  const bearer = getBearerAccessToken(request);
  if (bearer?.startsWith('ttr_app_')) return 'required';
  const { auth } = principal.supabase;
  const client = {
    auth: {
      getClaims: () => auth.getClaims(bearer),
      // The client already sends this bearer, which is how the route itself
      // resolved the user.
      getUser: () => auth.getUser(),
    },
  } as unknown as TypedSupabaseClient;
  const account = await checkRequiredAccountMfa(
    request,
    {
      createUserClient: async () => client,
      createAdminClient: async () =>
        (await createAdminClient({ noCookie: true })) as TypedSupabaseClient,
      nowSeconds: () => nowSeconds,
    },
    { userId: principal.user.id }
  );
  if (account.status === 'unavailable') return 'unavailable';
  if (account.status !== 'allowed') return 'required';
  if (maxAgeSeconds === null) return 'allowed';

  let proof = account.proof;
  if (!proof) {
    // An account without the required-MFA policy: the platform check asked
    // for no proof, a resume still does.
    try {
      const claims = await client.auth.getClaims();
      if (
        !claims.error &&
        claims.data &&
        claims.data.claims.sub === principal.user.id
      )
        proof = mfaProofFromVerifiedClaims(claims.data.claims, nowSeconds);
    } catch {
      proof = null;
    }
  }
  return isFreshMfaProof(proof, maxAgeSeconds, nowSeconds)
    ? 'allowed'
    : 'required';
}

/**
 * Null when the request may proceed, or the refusal. Reads need the
 * platform's account second-factor policy to pass; a resume also needs
 * same-origin proof and a second-factor proof of this very provider session
 * no older than CRON_RESUME_MFA_MAX_AGE_SECONDS.
 */
export async function refuseCronOperator(
  request: NextRequest,
  principal: Principal,
  action: 'read' | 'resume'
): Promise<NextResponse | null> {
  if (action === 'resume') {
    const crossOrigin = refuseCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
  }
  if (!(await isCronOperator(principal.user)))
    return cronRelayError('forbidden', 403);
  const limited = await refuseOverLimit(action, principal.user.id);
  if (limited) return limited;
  const status = await sessionAssurance(
    request,
    principal,
    action === 'resume' ? CRON_RESUME_MFA_MAX_AGE_SECONDS : null
  );
  if (status === 'unavailable') return cronRelayError('unavailable', 503);
  if (status !== 'allowed')
    return NextResponse.json(
      {
        error: 'mfa_required',
        ...(action === 'resume'
          ? { maxAgeSeconds: CRON_RESUME_MFA_MAX_AGE_SECONDS }
          : {}),
      },
      { status: 401, headers: CRON_RELAY_NO_STORE }
    );
  return null;
}
