import {
  createAppSessionUser,
  getAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import { checkCsrf } from '@tuturuuu/auth/csrf';
import {
  type DevboxOperation,
  requireDevboxActor as resolveActor,
} from '@tuturuuu/devbox/actor';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { primaryProofTime } from '@tuturuuu/utils/required-mfa-policy';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveDevboxIdentity } from './identity-store';
import { requireDevboxRunnerActor } from './runner-auth';

const denied = (status: number, code: string) => ({
  ok: false as const,
  response: NextResponse.json(
    code === 'UNAUTHORIZED'
      ? { message: 'Unauthorized' }
      : { message: code, code },
    { status, headers: { 'Cache-Control': 'no-store' } }
  ),
});
async function operationFor(
  request: Request,
  inspectWorkload = false
): Promise<DevboxOperation> {
  const path = new URL(request.url).pathname.replace(/^.*\/devboxes/, '');
  if (path === '/grant/accept') return 'accept';
  if (path.startsWith('/access-tokens')) return 'tokens';
  if (/^\/runs(?:\/|$)/.test(path) && ['GET', 'HEAD'].includes(request.method))
    return 'devbox:read';
  if (path === '/runs' && request.method === 'POST') {
    if (!inspectWorkload) return 'devbox:run';
    const body: unknown = await request
      .clone()
      .json()
      .catch(() => null);
    const input = z.object({ workload: z.string().optional() }).safeParse(body);
    const workload = input.success ? (input.data.workload ?? 'run') : 'run';
    return workload === 'run'
      ? 'devbox:run'
      : workload === 'build'
        ? 'devbox:build'
        : 'fleet';
  }
  if (
    /^\/(?:leases(?:\/|$)|env$|runs\/(?:[^/]+\/stop|stop-by-key)$)/.test(path)
  )
    return 'mutate';
  return 'fleet';
}

export async function requireDevboxActor(
  request: Request,
  options: { runner: true; requireOnline?: boolean }
): ReturnType<typeof requireDevboxRunnerActor>;
export async function requireDevboxActor(
  request: Request,
  options?: { operation?: DevboxOperation; stepUp?: boolean }
): Promise<Awaited<ReturnType<typeof requireUserActor>>>;
export async function requireDevboxActor(
  request: Request,
  options: {
    runner?: boolean;
    requireOnline?: boolean;
    operation?: DevboxOperation;
    stepUp?: boolean;
  } = {}
) {
  if (['GET', 'HEAD'].includes(request.method)) await connection();
  if (options.runner)
    return requireDevboxRunnerActor(request, {
      requireOnline: options.requireOnline,
    });
  return requireUserActor(request, options);
}

async function requireUserActor(
  request: Request,
  options: { operation?: DevboxOperation; stepUp?: boolean }
) {
  const operation = options.operation ?? (await operationFor(request));
  const accessToken = request.headers.get('X-Devbox-Access-Token');
  const sessionToken = getAppSessionTokenFromRequest(request);
  if (
    /^Bearer td(?:ba|bx)_/i.test(request.headers.get('authorization') ?? '') ||
    request.headers.has('X-Devbox-Runner-Token')
  )
    return denied(401, 'DEVBOX_CREDENTIAL_TYPE');
  if (
    accessToken &&
    (sessionToken ||
      /(?:^|;\s*)sb-[^=]+-auth-token/.test(request.headers.get('cookie') ?? ''))
  )
    return denied(400, 'DEVBOX_AMBIGUOUS_CREDENTIAL');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const csrf = checkCsrf({
      allowedOrigins: [new URL(request.url).origin],
      exemptions: [],
      headers: request.headers,
      method: request.method,
      pathname: new URL(request.url).pathname,
    });
    if (!csrf.ok) return denied(403, 'CSRF_REJECTED');
  }
  if (accessToken !== null) {
    if (!/^tdba_[0-9a-f]{64}$/.test(accessToken))
      return denied(401, 'DEVBOX_TOKEN_INVALID');
    const identity = await resolveDevboxIdentity({ token: accessToken });
    if (!identity?.token) return denied(401, 'DEVBOX_TOKEN_INVALID');
    const agentOperation =
      options.operation ?? (await operationFor(request, true));
    const verdict = await resolveActor({
      credential: { kind: 'agent', identity },
      operation: agentOperation,
      isRootMember: async () => {
        throw new Error('Agent credential cannot resolve fleet membership');
      },
    });
    if (!verdict.ok) return denied(verdict.status, verdict.code);
    const admin = await createAdminClient({ noCookie: true });
    const { data, error } = await admin.auth.admin.getUserById(
      verdict.actor.userId
    );
    if (error || !data.user) return denied(401, 'DEVBOX_TOKEN_INVALID');
    return {
      ok: true as const,
      user: data.user,
      actor: verdict.actor,
      issuedAt: null,
      authentication: 'agent',
    };
  }
  let issuedAt: number | null = null;
  let stepUpAt: number | null = null;
  let mfa = false;
  const cli = Boolean(sessionToken);
  let user: SupabaseUser | null = null;
  if (sessionToken) {
    const verified = verifyCliAccessToken(sessionToken);
    if (!verified.ok) return denied(401, 'UNAUTHORIZED');
    user = createAppSessionUser(verified.claims);
    issuedAt = verified.claims.iat * 1000;
    const proof = verified.claims.mfa;
    if (
      proof &&
      (proof.expiresAt === undefined || proof.expiresAt * 1000 > Date.now())
    ) {
      stepUpAt = proof.verifiedAt * 1000;
      mfa = true;
    }
  } else {
    const supabase = await createClient(request);
    user = (await resolveAuthenticatedSessionUser(supabase)).user;
    if (!user) return denied(401, 'UNAUTHORIZED');
    if (
      options.stepUp ||
      operation === 'accept' ||
      (operation === 'tokens' && request.method === 'POST')
    ) {
      const data =
        typeof supabase.auth?.getClaims === 'function'
          ? (await supabase.auth.getClaims().catch(() => ({ data: null }))).data
          : null;
      const claims = z
        .object({
          sub: z.string(),
          iat: z.number(),
          aal: z.string().optional(),
          amr: z
            .array(z.object({ method: z.string(), timestamp: z.number() }))
            .optional(),
        })
        .safeParse(data?.claims);
      if (claims.success && claims.data.sub === user.id) {
        // JWT iat alone may be a refresh; step-up comes from a verified auth method.
        issuedAt = claims.data.iat * 1000;
        const primary = primaryProofTime(claims.data);
        stepUpAt = primary === null ? null : primary * 1000;
        mfa = claims.data.aal === 'aal2';
      }
    }
  }
  const permissions = await getPermissions({
    request,
    user,
    wsId: ROOT_WORKSPACE_ID,
  });
  const rootMember = permissions?.membershipType === 'MEMBER';
  const identity = rootMember
    ? null
    : await resolveDevboxIdentity({ userId: user.id });
  const verdict = await resolveActor({
    credential: { kind: 'session', userId: user.id, issuedAt, cli, identity },
    operation,
    isRootMember: async () => rootMember,
  });
  if (!verdict.ok) return denied(verdict.status, verdict.code);
  if (
    options.stepUp ||
    operation === 'accept' ||
    (operation === 'tokens' && request.method === 'POST')
  ) {
    if (
      stepUpAt === null ||
      stepUpAt > Date.now() ||
      Date.now() - stepUpAt > 600000 ||
      (cli && !mfa) ||
      (identity?.grant?.require_mfa && !mfa)
    )
      return denied(403, 'DEVBOX_STEP_UP_REQUIRED');
    if (operation === 'accept' && cli)
      return denied(403, 'DEVBOX_WEB_ACCEPTANCE_REQUIRED');
    if (
      operation === 'tokens' &&
      cli &&
      issuedAt !== null &&
      identity?.grant &&
      Math.min(issuedAt, stepUpAt) <
        Math.max(
          Date.parse(identity.grant.sessions_not_before),
          Date.parse(identity.grant.accepted_at ?? '')
        )
    )
      return denied(403, 'DEVBOX_SESSION_CUTOFF');
  }
  return {
    ok: true as const,
    user,
    actor: verdict.actor,
    issuedAt,
    authentication: cli ? 'cli' : 'web',
  };
}
