import { getAppSessionClaimsFromRequest } from '@tuturuuu/auth/app-session';
import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { isAbuseGuardFamilyAssigned } from '@tuturuuu/utils/abuse-guard/select';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { bindCurrentMfaFactor } from '@tuturuuu/utils/required-mfa-lineage';
import {
  mfaProofFromVerifiedClaims,
  readRequiredMfaPolicy,
  satisfiesRequiredMfaPolicy,
} from '@tuturuuu/utils/required-mfa-policy';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

function deny(message: string, status: number) {
  return {
    ok: false as const,
    response: NextResponse.json({ message }, { status }),
  };
}

export async function authorizeIpOperator(request: Request, write = false) {
  try {
    const authorization = request.headers.get('authorization');
    const bearer = authorization?.match(/^Bearer (\S+)$/iu)?.[1];
    const verified = bearer ? verifyCliAccessToken(bearer) : null;
    if (
      bearer?.startsWith('ttr_app_') &&
      !verified?.ok &&
      !getAppSessionClaimsFromRequest(request, { targetApp: 'infra' })
    )
      return deny('Invalid CLI session', 401);

    const claims =
      verified?.ok && verified.claims.origin_app === 'cli'
        ? verified.claims
        : null;
    const actor = claims
      ? null
      : await resolveSatelliteRequestActor(request, 'infra');
    const actorId = claims?.sub ?? actor?.user.id;
    if (!actorId) return deny('Sign in required', 401);

    const limiter = await getUpstashRestRedisClient(
      isAbuseGuardFamilyAssigned('ratelimit')
        ? { family: 'ratelimit' }
        : undefined
    );
    if (!limiter) return deny('Operator rate limit unavailable', 503);
    const window = await limiter.incrRateWindow(
      `infra-ip-operator:${write ? 'write' : 'read'}:${actorId}`,
      60_000
    );
    if (window.n > (write ? 6 : 30))
      return deny('Operator rate limit exceeded', 429);

    const sbAdmin = await createAdminClient({ noCookie: true });
    const { data, error } = await sbAdmin.auth.admin.getUserById(actorId);
    if (error) return deny('Staff verification unavailable', 503);
    const user = data.user;
    if (
      user?.id !== actorId ||
      !isVerifiedTuturuuuStaffSession(user) ||
      (claims && claims.email !== user.email) ||
      (user.banned_until && !(Date.parse(user.banned_until) <= Date.now()))
    )
      return deny('Verified staff required', 403);

    const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID, user });
    if (
      permissions?.membershipType !== 'MEMBER' ||
      !permissions.containsPermission('view_infrastructure') ||
      (write && !permissions.containsPermission('manage_workspace_roles'))
    )
      return deny('Infrastructure permission required', 403);

    const policy = readRequiredMfaPolicy(user.app_metadata);
    const now = Math.floor(Date.now() / 1000);
    const browserClaims = claims
      ? null
      : getAppSessionClaimsFromRequest(request, { targetApp: 'infra' });
    let proof =
      claims?.mfa ??
      (browserClaims && browserClaims.sub === actorId
        ? browserClaims.mfa
        : null);
    const providerSession = !claims && !browserClaims;
    if ((policy.required || write) && providerSession) {
      const client = await createClient(request);
      const result = await client.auth.getClaims();
      if (!result.error && result.data?.claims?.sub === actorId)
        proof = mfaProofFromVerifiedClaims(result.data.claims, now);
    }
    if (
      (policy.required || write) &&
      (!proof ||
        !satisfiesRequiredMfaPolicy(
          { ...policy, required: true },
          proof,
          now
        ) ||
        (write && now - proof.verifiedAt > 600) ||
        !(await bindCurrentMfaFactor(
          sbAdmin,
          actorId,
          proof,
          providerSession || !policy.required
        )))
    )
      return deny('Recent MFA verification required. Sign in again.', 403);

    return { ok: true as const, sbAdmin, user };
  } catch {
    return deny('Operator authorization unavailable', 503);
  }
}
