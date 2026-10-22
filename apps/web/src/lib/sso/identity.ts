import {
  authorizeIdentity,
  type LoginTransaction,
  principalSchema,
  SsoError,
} from '@tuturuuu/sso';
import { createRequestClient } from '@tuturuuu/supabase/request/server';
import { bindCurrentMfaFactor } from '@tuturuuu/utils/required-mfa-lineage';
import {
  mfaProofFromVerifiedClaims,
  primaryProofTime,
  readRequiredMfaPolicy,
  requiresFreshPrimaryForMfa,
  satisfiesRequiredMfaPolicy,
} from '@tuturuuu/utils/required-mfa-policy';
import { checkRequiredAccountMfa } from '@tuturuuu/utils/required-mfa-request';
import type { SsoConfiguration } from './config';
import { boundedFetch, type SsoAdmin, snapshot } from './store';

/** Web cookie identity only; external SAML never receives an internal app token. */
export async function principal(request: Request, admin: SsoAdmin) {
  // Ignore Authorization: browser consent is bound only to provider cookies.
  const cookieHeaders = new Headers(request.headers);
  cookieHeaders.delete('authorization');
  const client = await createRequestClient(
    new Request(request.url, { headers: cookieHeaders }),
    { fetch: boundedFetch }
  );
  const authenticated = await client.auth.getUser();
  if (authenticated.error || !authenticated.data.user)
    throw new SsoError({ code: 'forbidden' });
  const userId = authenticated.data.user.id;
  const live = await admin.auth.admin.getUserById(userId);
  if (live.error || !live.data.user)
    throw new SsoError({ code: 'unavailable' });
  const user = live.data.user;
  if (user.id !== userId) throw new SsoError({ code: 'forbidden' });
  const now = Math.floor(Date.now() / 1000);
  const account = await checkRequiredAccountMfa(
    request,
    {
      createAdminClient: async () => admin,
      createUserClient: async () => client,
      nowSeconds: () => now,
    },
    { userId }
  );
  if (account.status !== 'allowed')
    throw new SsoError({
      code: account.status === 'required' ? 'mfa_required' : 'forbidden',
    });
  const verified = await client.auth.getClaims();
  const claims = verified.data?.claims;
  if (verified.error || !claims || claims.sub !== userId)
    throw new SsoError({ code: 'forbidden' });
  const proof = mfaProofFromVerifiedClaims(claims, now);
  const primaryAt = primaryProofTime(claims, now);
  if (
    !proof ||
    primaryAt === null ||
    requiresFreshPrimaryForMfa(user.app_metadata, claims) ||
    !satisfiesRequiredMfaPolicy(
      readRequiredMfaPolicy(user.app_metadata),
      proof,
      now
    )
  ) {
    throw new SsoError({ code: 'mfa_required' });
  }
  // Phase-1 assurance represents TOTP; other MFA methods need a qualified profile.
  if (
    !Array.isArray(claims.amr) ||
    !claims.amr.some(
      (a: unknown) =>
        a &&
        typeof a === 'object' &&
        'method' in a &&
        'timestamp' in a &&
        a.method === 'totp' &&
        a.timestamp === proof.verifiedAt
    )
  )
    throw new SsoError({ code: 'mfa_required' });
  const bound = await bindCurrentMfaFactor(admin, userId, proof, true);
  if (!bound) throw new SsoError({ code: 'mfa_required' });
  return principalSchema.parse({
    userId,
    sessionId: proof.sessionId,
    email: user.email,
    emailConfirmed: Boolean(user.email_confirmed_at),
    accountAllowed:
      !user.is_anonymous &&
      (!user.banned_until || Date.parse(user.banned_until) <= Date.now()),
    firstName: user.user_metadata.given_name,
    lastName: user.user_metadata.family_name,
    factorCurrent: true,
    primaryAt,
    mfaAt: proof.verifiedAt,
  });
}

export async function consentIdentity(
  request: Request,
  admin: SsoAdmin,
  config: SsoConfiguration,
  state: LoginTransaction
) {
  const actor = await principal(request, admin);
  const current = await snapshot(admin, config, actor.userId);
  authorizeIdentity({
    ...current,
    principal: actor,
    request: state.request,
    now: new Date(),
  });
  return { actor, current };
}
